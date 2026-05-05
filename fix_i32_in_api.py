import glob
import re

files = glob.glob("backend/src/api/*.rs")
for file in files:
    with open(file, "r") as f:
        content = f.read()

    # Replace Option<i32> returning IDs
    content = re.sub(r'Option<i32> = sqlx::query_scalar\((.*?"SELECT id FROM)', r'Option<i64> = sqlx::query_scalar(\1', content)
    
    # Replace pub provider_id: Option<i32> and similar in api/models.rs
    content = re.sub(r'pub provider_id: Option<i32>', r'pub provider_id: Option<i64>', content)
    content = re.sub(r'pub type_id: Option<i32>', r'pub type_id: Option<i64>', content)

    # In task_logs.rs and logs.rs: let perm: Option<i32> = sqlx::query_scalar("SELECT allow_view_log_details...")
    # allow_view_log_details is actually INT4 in postgres, so let's LEAVE IT as i32!

    with open(file, "w") as f:
        f.write(content)

print("Done")
