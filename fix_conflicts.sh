#!/bin/bash
# fix git_log.txt
sed -i '' -e '/<<<<<<< HEAD/d' -e '/=======/d' -e '/>>>>>>> origin\/chenzs/d' backend/git_log.txt

# fix migrations.rs
sed -i '' -e '/<<<<<<< HEAD/d' -e '/=======/d' -e '/>>>>>>> origin\/chenzs/d' backend/src/db/migrations.rs
