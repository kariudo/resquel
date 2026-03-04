# Examples

The following files are utilized with unit tests. They should be functional as written when used in combination with databases set up by the docker-compose file also provided here.

## Configuration Files

- **mysql.json** - Basic MySQL/MariaDB configuration
- **mysql8-legacy-auth.json** - MySQL 8 configuration with legacy authentication support (for connecting to MySQL 8 servers with caching_sha2_password)
- **postgres.json** - PostgreSQL configuration
- **mssql.json** - Microsoft SQL Server configuration

> **Note:** All MySQL configuration files work with MariaDB as well. MariaDB uses the same `mysql` client configuration.

## MySQL 8 Legacy Authentication

If you're using MySQL 8 and encountering authentication errors, use the `mysql8-legacy-auth.json` configuration which includes the `insecureAuth` option to enable compatibility with the legacy authentication method.
