# tokensbyte opensource
# (c) 2026 tokensbyte.ai
# @copyright      Copyright netbcloud/wstianxia 
# @license        MIT (https://www.tokensbyte.ai/)

import json
import os
import asyncio
from deep_translator import GoogleTranslator
from deep_translator.exceptions import RequestError

async def translate_dict(data, to_lang, translator):
    result = {}
    for k, v in data.items():
        if isinstance(v, dict):
            result[k] = await translate_dict(v, to_lang, translator)
        elif isinstance(v, str):
            if v.strip() == "":
                result[k] = v
                continue
            # Async translation
            loop = asyncio.get_event_loop()
            try:
                translated = await loop.run_in_executor(None, translator.translate, v)
                result[k] = translated if translated else v
            except Exception as e:
                print(f"Error translating '{v}': {e}")
                result[k] = v
        else:
            result[k] = v
    return result

async def process_file(filepath, to_lang):
    out_dir = os.path.dirname(filepath)
    out_file = os.path.join(out_dir, f"{to_lang}.json")
    if os.path.exists(out_file):
        print(f"Skipping {out_file}, already exists.")
        return
        
    print(f"Translating {filepath} to {to_lang}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    translator = GoogleTranslator(source='zh-CN', target=to_lang)
    translated_data = await translate_dict(data, to_lang, translator)
    
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(translated_data, f, ensure_ascii=False, indent=2)
    print(f"Saved {out_file}")

async def main():
    base_dir = "/Volumes/D/aiwwwroot/tokensbyte/frontend/src"
    files = [
        "locales/zh.json",
        "pages/Plugins/AssetManager/locales/zh.json",
        "pages/Plugins/AssetManagerIntl/locales/zh.json",
        "pages/Plugins/Playground/locales/zh.json",
        "pages/Plugins/TeamMarketing/locales/zh.json",
        "pages/Plugins/ModelMarketplace/locales/zh.json"
    ]
    
    tasks = []
    for f in files:
        full_path = os.path.join(base_dir, f)
        if os.path.exists(full_path):
            tasks.append(process_file(full_path, 'ja'))
            tasks.append(process_file(full_path, 'ko'))
            
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
