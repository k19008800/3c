# PowerShell script to check PostgreSQL databases
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d postgres -c "SELECT datname FROM pg_database;"