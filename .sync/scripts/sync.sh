#!/bin/bash

# TokensByte 仓库同步脚本
# 支持内部 → 商用 → 公开的分层同步
# 版本号: 2.0.0

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
export CONFIG_DIR="$PROJECT_ROOT/.sync/config"

# 在 URL 中注入 Token
inject_token() {
  local url="$1"
  if [ -n "$GITHUB_TOKEN" ]; then
    echo "$url" | sed -e "s|https://|https://x-access-token:$GITHUB_TOKEN@|"
  else
    echo "$url"
  fi
}

# 检查 git filter-repo 是否安装
check_dependencies() {
  if ! command -v git-filter-repo &> /dev/null; then
    echo "❌ git-filter-repo 未安装"
    echo "请运行: pip install git-filter-repo"
    exit 1
  fi
  if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
  fi
}

# 创建临时工作目录
create_temp_dir() {
  local temp_dir=$(mktemp -d -t tokensbyte-sync-XXXXXX)
  echo "$temp_dir"
}

# 使用 Python 读取配置并执行同步
sync_with_python() {
    local target="$1"
    python3 - "$target" << 'EOF'
import json
import os
import shutil
import subprocess
import sys
import tempfile

target = sys.argv[1] if len(sys.argv) > 1 else 'all'
config_dir = os.environ.get('CONFIG_DIR')
if not config_dir:
    config_dir = os.path.join(os.getcwd(), '.sync', 'config')
project_root = os.path.dirname(os.path.dirname(config_dir))

# 读取配置
with open(os.path.join(config_dir, 'repos.json'), 'r') as f:
    repos = json.load(f)

with open(os.path.join(config_dir, 'filters.json'), 'r') as f:
    filters = json.load(f)

# 注入 token
def inject_token(url):
    token = os.environ.get('GITHUB_TOKEN', '')
    if token:
        return url.replace('https://', f'https://x-access-token:{token}@')
    return url

# 创建临时目录
temp_dir = tempfile.mkdtemp(prefix='tokensbyte-sync-')
print(f'📁 临时目录: {temp_dir}')

# 同步函数
def sync(source_config, filter_config, target_name):
    print(f'🚀 开始同步（方案1 - 覆盖复制）：内部仓库 → {target_name}')
    downstream_dir = os.path.join(temp_dir, 'downstream')
    
    # 1. 克隆下游仓库
    target_url = inject_token(source_config['url'])
    target_branch = source_config['branch']
    
    try:
        subprocess.run(['git', 'clone', '--depth', '1', '-b', target_branch, target_url, downstream_dir], check=True, cwd=temp_dir)
    except subprocess.CalledProcessError:
        print('⚠️ 克隆失败或分支不存在，尝试初始化新仓库...')
        os.makedirs(downstream_dir, exist_ok=True)
        subprocess.run(['git', 'init'], check=True, cwd=downstream_dir)
        subprocess.run(['git', 'checkout', '-b', target_branch], check=True, cwd=downstream_dir)
        subprocess.run(['git', 'remote', 'add', 'origin', target_url], check=True, cwd=downstream_dir)

    # 2. 清空下游工作区（保留 .git）
    if os.path.exists(downstream_dir):
        for item in os.listdir(downstream_dir):
            if item == '.git':
                continue
            item_path = os.path.join(downstream_dir, item)
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
            else:
                os.remove(item_path)

    # 3. 复制白名单包含的文件/目录
    includes = filter_config.get('include', [])
    for inc in includes:
        inc_clean = inc.strip('/')
        src_path = os.path.join(project_root, inc_clean)
        dest_path = os.path.join(downstream_dir, inc_clean)
        
        if os.path.exists(src_path):
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            if os.path.isdir(src_path):
                shutil.copytree(src_path, dest_path)
            else:
                shutil.copy2(src_path, dest_path)

    # 4. 删除排除的文件/目录
    excludes = filter_config.get('exclude', [])
    for exc in excludes:
        exc_clean = exc.strip('/')
        dest_path = os.path.join(downstream_dir, exc_clean)
        if os.path.exists(dest_path):
            if os.path.isdir(dest_path):
                shutil.rmtree(dest_path)
            else:
                os.remove(dest_path)

    # 5. 提交并推送
    status_proc = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True, check=True, cwd=downstream_dir)
    if status_proc.stdout.strip():
        subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True, cwd=downstream_dir)
        subprocess.run(['git', 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], check=True, cwd=downstream_dir)
        
        sha_proc = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, check=True, cwd=project_root)
        msg_proc = subprocess.run(['git', 'log', '-1', '--pretty=%s'], capture_output=True, text=True, check=True, cwd=project_root)
        last_sha = sha_proc.stdout.strip()
        last_msg = msg_proc.stdout.strip()
        
        subprocess.run(['git', 'add', '-A'], check=True, cwd=downstream_dir)
        subprocess.run(['git', 'commit', '-m', f'sync: update from internal at {last_sha} ({last_msg})'], check=True, cwd=downstream_dir)
        
        print(f'📤 推送更改到 {target_name} ({target_branch})...')
        subprocess.run(['git', 'push', 'origin', target_branch], check=True, cwd=downstream_dir)
        print(f'✅ {target_name} 同步完成')
    else:
        print(f'✨ {target_name} 没有发现变化，无需推送。')

# 执行同步
if target in ['all', 'internal-to-commercial']:
    sync(repos['commercial'], filters['internal_to_commercial'], '商业仓库')

if target in ['all', 'internal-to-public']:
    sync(repos['public'], filters['internal_to_public'], '公开仓库')

# 清理
import shutil
shutil.rmtree(temp_dir)

if target == 'all':
    print('🎉 全部同步完成！')
EOF
}

# 显示帮助
show_help() {
    echo "TokensByte 仓库同步工具"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  internal-to-commercial  同步内部仓库到商业仓库"
    echo "  internal-to-public      同步内部仓库到公开仓库"
    echo "  all                     同步全部（内部→商业 + 内部→公开）"
    echo "  help                    显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  GITHUB_TOKEN            GitHub 访问令牌（可选，用于 CI/CD）"
}

# 主函数
main() {
    check_dependencies
    
    case "${1:-help}" in
        internal-to-commercial|internal-to-public|all)
            sync_with_python "$1"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "❌ 未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
