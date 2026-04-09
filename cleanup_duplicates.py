import sqlite3

db_path = 'backend/data/tokensbyte.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def merge_duplicates(table, ref_col):
    print(f"Merging duplicates for {table}...")
    cursor.execute(f"SELECT name, MIN(id), MAX(id), COUNT(*) FROM {table} GROUP BY name HAVING COUNT(*) > 1")
    duplicates = cursor.fetchall()
    
    for name, keep_id, delete_id, count in duplicates:
        print(f"  Found duplicate: '{name}' (IDs: {keep_id}, {delete_id}, count: {count})")
        # Find all IDs for this name
        cursor.execute(f"SELECT id FROM {table} WHERE name = ?", (name,))
        all_ids = [row[0] for row in cursor.fetchall()]
        keep_id = all_ids[0]
        duplicate_ids = all_ids[1:]
        
        for dup_id in duplicate_ids:
            # Update models table to point to keep_id
            cursor.execute(f"UPDATE models SET {ref_col} = ? WHERE {ref_col} = ?", (keep_id, dup_id))
            # Delete duplicate
            cursor.execute(f"DELETE FROM {table} WHERE id = ?", (dup_id,))
            print(f"    Merged ID {dup_id} into {keep_id}")

merge_duplicates('model_providers', 'provider_id')
merge_duplicates('model_types', 'type_id')

conn.commit()
conn.close()
print("Cleanup complete.")
