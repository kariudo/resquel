# Resquel

A lightweight Express.js middleware library that converts SQL databases into REST APIs through simple route and query configuration.

> **Note:** This is a maintained fork focused on modernization and continued development. Originally inspired by the Form.io SQL connector concept.

**Supported Databases:** Microsoft SQL Server, MySQL, and PostgreSQL

## How It Works

Resquel maps Express.js routes to SQL queries that execute when the routes are triggered. You define the routes, endpoints, and queries - Resquel handles the rest.

For example, given a SQL table `customer` with fields:

- `firstName`
- `lastName`
- `email`

You can create a full REST API:

- **GET /customer** - List all customers
- **GET /customer/:id** - Get a single customer
- **POST /customer** - Create a new customer
- **PUT /customer/:id** - Update a customer
- **DELETE /customer/:id** - Delete a customer

See the **Full CRUD Example** below for complete configuration.

## Installation

```bash
npm install @kariudo/resquel
# or
yarn add @kariudo/resquel
```

## Usage

Include Resquel in your Express.js application:

```javascript
const { Resquel } = require('@kariudo/resquel');
const express = require('express');
const app = express();

(async function () {
  const resquel = new Resquel({
    db: {
      client: 'mysql',
      connection: {
        host: 'localhost',
        database: 'myapp',
        user: 'dbuser',
        password: 'CHANGEME',
      },
    },
    routes: [
      {
        method: 'get',
        endpoint: '/customer',
        query: 'SELECT * FROM customers',
      },
      // ... more routes
    ],
  });
  await resquel.init();
  app.use(resquel.router);

  // Listen to port 3010
  app.listen(3010);
})();
```

## Configuration

### Database Connection

Database configuration is passed through to [Knex.js](http://knexjs.org/#Installation-client). All Knex connection options are supported. Examples:

**MySQL:**

```javascript
db: {
  client: 'mysql',
  connection: {
    host: 'localhost',
    database: 'mydb',
    user: 'dbuser',
    password: 'password'
  }
}
```

**PostgreSQL:**

```javascript
db: {
  client: 'pg',
  connection: {
    host: 'localhost',
    database: 'mydb',
    user: 'dbuser',
    password: 'password'
  }
}
```

**Microsoft SQL Server:**

```javascript
db: {
  client: 'mssql',
  connection: {
    server: 'localhost',
    database: 'mydb',
    user: 'dbuser',
    password: 'password'
  }
}
```

### Routes

Routes are defined as an array of route configuration objects. Each route specifies the HTTP method, endpoint, and the SQL query to execute:

```javascript
{
  method: 'get|post|put|delete',
  endpoint: '/your/endpoint/:withParams',
  query: 'SELECT * FROM customer'
}
```

### Query Formats

Queries can be provided in three forms:

#### 1. Simple Query

```javascript
query: 'SELECT * FROM customer';
```

Basic string query. Limited in functionality but useful for simple reads.

#### 2. Multiple Queries

```javascript
query: ['TRUNCATE customer', 'SELECT * FROM customer'];
```

Executes queries in sequence. Only the last query's result is returned in the response.

#### 3. Prepared Queries (Recommended)

```javascript
query: [
  [
    'UPDATE customer SET firstName=?, lastName=?, email=? WHERE id=?',
    'body.firstName',
    'body.lastName',
    'body.email',
    'params.id',
  ],
  ['SELECT * FROM customer WHERE id=?', 'params.id'],
];
```

Prepared queries use parameter binding for security. The first element in each inner array is the SQL query with `?` placeholders. Subsequent elements are object paths on the Express `req` object (e.g., `params`, `body`, `query`, `headers`).

If required parameters are missing, an error is returned and execution halts.

**Note:** When using prepared queries, all queries in the route must use the prepared format. Mixing formats will result in an error.

**Invalid Example:**

```javascript
query: [
  ['DELETE FROM customer WHERE id=?', 'params.customerId'],
  'SELECT COUNT(*) AS num FROM customer', // ❌ Cannot mix formats
];
```

### Full CRUD Example

Complete REST API for a `customers` table with fields: `firstName`, `lastName`, `email`

```javascript
const { Resquel } = require('@kariudo/resquel');
const express = require('express');
const app = express();

(async function () {
  const resquel = new Resquel({
    db: {
      client: process.env.DB_TYPE,
      connection: {
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
      },
    },
    routes: [
      // List all customers
      {
        method: 'get',
        endpoint: '/customer',
        query: 'SELECT * FROM customers',
      },
      // Create a customer
      {
        method: 'post',
        endpoint: '/customer',
        query: [
          [
            'INSERT INTO customers (firstName, lastName, email) VALUES (?, ?, ?)',
            'body.data.firstName',
            'body.data.lastName',
            'body.data.email',
          ],
          'SELECT * FROM customers WHERE id=LAST_INSERT_ID()',
        ],
      },
      // Get a single customer
      {
        method: 'get',
        endpoint: '/customer/:id',
        query: [['SELECT * FROM customers WHERE id=?', 'params.id']],
      },
      // Update a customer
      {
        method: 'put',
        endpoint: '/customer/:id',
        query: [
          [
            'UPDATE customers SET firstName=?, lastName=?, email=? WHERE id=?',
            'body.data.firstName',
            'body.data.lastName',
            'body.data.email',
            'params.id',
          ],
          ['SELECT * FROM customers WHERE id=?', 'params.id'],
        ],
      },
      // Delete a customer
      {
        method: 'delete',
        endpoint: '/customer/:id',
        query: [['DELETE FROM customers WHERE id=?', 'params.id']],
      },
    ],
  });
  await resquel.init();
  app.use(resquel.router);
  app.listen(3010);
})();
```

## Troubleshooting

### Using with MySQL 8

MySQL 8 requires explicit password authentication configuration. Run these queries in your database to enable password authentication:

```sql
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'YourRootPassword';
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'YourRootPassword';
```

## Examples

See the [example/](example/) directory for working configurations with Docker Compose setups for:

- MySQL
- PostgreSQL
- Microsoft SQL Server

## License

GPL-3.0 - see [LICENSE.md](LICENSE.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
