import os
import re

def replace_in_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for pattern, repl in replacements:
        new_content = re.sub(pattern, repl, new_content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

models_replacements = [
    (r"pub id: i32,", r"pub id: i64,"),
    (r"pub id: Option<i32>,", r"pub id: Option<i64>,"),
    (r"provider_id: Option<i32>,", r"provider_id: Option<i64>,"),
    (r"type_id: Option<i32>,", r"type_id: Option<i64>,"),
    (r"billing_rule_id: Option<i32>,", r"billing_rule_id: Option<i64>,"),
    (r"forward_rule_ids: Option<Vec<i32>>,", r"forward_rule_ids: Option<Vec<i64>>,"),
    (r"forward_rule_id: Option<i32>,", r"forward_rule_id: Option<i64>,"),
    (r"pub parent_id: Option<i32>,", r"pub parent_id: Option<i64>,"),
]

api_replacements = [
    (r"Path<i32>", r"Path<i64>"),
    (r"get::<i32", r"get::<i64"),
    (r"id_i32", r"id_i64"),
]

for root, dirs, files in os.walk('backend/src/models'):
    for f in files:
        if f.endswith('.rs'):
            replace_in_file(os.path.join(root, f), models_replacements)

for root, dirs, files in os.walk('backend/src/api'):
    for f in files:
        if f.endswith('.rs'):
            replace_in_file(os.path.join(root, f), api_replacements)

# Now generate a SQL script to alter all tables that have ID as integer/serial
