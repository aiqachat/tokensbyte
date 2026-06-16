# Agent 协作规则

## 开发流程规范

1. **禁止自动编译和重启本地开发环境**。Agent 不得自行执行 `cargo run`、`cargo build`、`npm run dev`、`npm run build`、`docker compose up` 等编译/启动命令。本地开发环境（后端服务 + 前端服务 + 数据库）由用户自行管理，Agent 只负责修改源代码文件。多个智能体可能同时并发开发，自动重启会导致服务冲突和端口占用。
2. **避免创建临时脚本文件**，根目录下的 Python 脚本（如 `patch_*.py`、`update_*.py`、`modify_*.py`）应在功能实现后立即清理，不保留在代码库中
3. **直接修改源文件而非使用临时脚本**，除非需要批量处理或复杂重构，否则优先直接编辑目标文件
4. **临时脚本命名规范**（如确需创建）：使用明确的任务描述前缀，如 `temp_*` 或 `patch_*`，并在脚本注释中说明用途、预期使用时间和清理条件
5. **脚本使用后及时删除**，功能落地并通过验证后，立即删除临时脚本，避免项目根目录杂乱
6. **优先使用 Git 管理变更**，对于一次性修改，直接提交 Git commit 而非创建临时脚本

## 文档管理规则

1. **主要维护 README.md 和 UPDATE.md**，尽量减少新建文档文件
2. **部署相关内容统一放在 README.md 的部署章节**，不再单独创建部署指南文档（如 DEPLOY-SCRIPT-GUIDE.md、EXPORT-IMAGES-GUIDE.md、QUICK-EXPORT.md 等）
3. **删除文档前必须确认无其他文件引用**，使用 grep 检查所有交叉引用并同步更新
4. **脚本中动态生成的文档**（如 export-images 生成的 UPLOAD-GUIDE.txt、import-images.sh）需与 README.md 保持一致，修改 README 部署内容时同步检查脚本内嵌文本
5. **新增部署方式或配置项时**，优先在 README.md 现有章节内扩展，而非新建文档
6. **UPDATE.md 记录变更历史**，文档整合/删除操作需在 UPDATE.md 中标注去向（如"已整合至 README.md"）
7. **Rust 代码质量标准（黄金三步 CI 检查）**，任何代码修改/提交前必须确保通过以下三项：
   - **格式化**：`cargo fmt --all`，CI 验收 `cargo fmt --all -- --check` 无差异
   - **Lint**：`cargo clippy --all-targets --all-features -- -D warnings`，所有 Clippy 警告视为错误，禁止无说明的 `#[allow(...)]`
   - **测试**：`cargo test --all-targets --all-features`，核心逻辑修改/新增必须包含对应单元测试
   - Agent 交付代码前须模拟或实际运行上述三步，主动消除 Clippy 警告（如不必要的 clone、可简化的循环等），不交付带警告的代码
