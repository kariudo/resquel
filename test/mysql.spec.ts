import { faker } from '@faker-js/faker';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysqlConfig from '../example/mysql.json';
import { Resquel, type ResquelConfig } from '../src';

const config: ResquelConfig = mysqlConfig;
const app = express();

describe('mysql tests', () => {
  const called = {
    POST: [],
    GET: [],
    PUT: [],
    DELETE: [],
    INDEX: [],
  };
  let customer = null;

  describe('bootstrap routes', () => {
    it('add before/after route functions', () => {
      config.routes.forEach((route) => {
        let type = route.method.toString().toUpperCase();
        if (type === 'GET' && route.endpoint.indexOf('/:') === -1) {
          type = 'INDEX';
        }

        route.before = (_req, _res, next) => {
          called[type].push('before');
          next();
        };
        route.after = (_req, _res, next) => {
          called[type].push('after');
          next();
        };
      });
    });
  });

  describe('bootstrap environment', () => {
    let resquel: Resquel;
    beforeAll(async () => {
      resquel = new Resquel(config);
      await resquel.init();
    });

    afterAll(() => {
      app.use(resquel.router);
    });

    it('drop the test db', async () => {
      await resquel.knexClient.raw('DROP DATABASE IF EXISTS `test`');
    });

    it('create the test db', async () => {
      await resquel.knexClient.raw('CREATE DATABASE IF NOT EXISTS `test`');
      await resquel.knexClient.raw('USE `test`');
    });

    it('create the test table', async () => {
      await resquel.knexClient.raw(
        'CREATE TABLE `customers` (' +
          '`id` int(16) unsigned NOT NULL AUTO_INCREMENT,' +
          '`firstName` varchar(256) COLLATE latin1_general_ci DEFAULT NULL,' +
          '`lastName` varchar(256) COLLATE latin1_general_ci DEFAULT NULL,' +
          '`email` varchar(256) COLLATE latin1_general_ci DEFAULT NULL,' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_general_ci',
      );
    });
  });

  describe('create tests', () => {
    it('create a customer', async () => {
      const res = await request(app)
        .post('/customer')
        .send({
          data: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
          },
        })
        .expect('Content-Type', /json/)
        .expect(200);

      const response = res.body;
      expect(response.rows).toHaveLength(1);
      customer = response.rows[0];
    });

    it('the before handler was called first for the route', () => {
      expect(Array.isArray(called.POST)).toBe(true);
      expect(called.POST.length).toBeGreaterThanOrEqual(1);
      expect(called.POST[0]).toBe('before');
    });

    it('the after handler was called second for the route', () => {
      expect(Array.isArray(called.POST)).toBe(true);
      expect(called.POST.length).toBeGreaterThanOrEqual(2);
      expect(called.POST[1]).toBe('after');
    });
  });

  describe('index tests', () => {
    it('read the index of all customers', async () => {
      const res = await request(app).get('/customer').expect('Content-Type', /json/).expect(200);

      const response = res.body;
      expect(response.rows).toHaveLength(1);
    });

    it('the before handler was called first for the route', () => {
      expect(Array.isArray(called.INDEX)).toBe(true);
      expect(called.INDEX.length).toBeGreaterThanOrEqual(1);
      expect(called.INDEX[0]).toBe('before');
    });

    it('the after handler was called second for the route', () => {
      expect(Array.isArray(called.INDEX)).toBe(true);
      expect(called.INDEX.length).toBeGreaterThanOrEqual(2);
      expect(called.INDEX[1]).toBe('after');
    });
  });

  describe('read tests', () => {
    it('read a customer', async () => {
      const res = await request(app)
        .get(`/customer/${customer.id}`)
        .expect('Content-Type', /json/)
        .expect(200);

      const response = res.body;
      expect(response.rows).toHaveLength(1);
      expect(response.rows[0]).toEqual(customer);
    });

    it('the before handler was called first for the route', () => {
      expect(Array.isArray(called.GET)).toBe(true);
      expect(called.GET.length).toBeGreaterThanOrEqual(1);
      expect(called.GET[0]).toBe('before');
    });

    it('the after handler was called second for the route', () => {
      expect(Array.isArray(called.GET)).toBe(true);
      expect(called.GET.length).toBeGreaterThanOrEqual(2);
      expect(called.GET[1]).toBe('after');
    });
  });

  describe('update tests', () => {
    it('update a customer', async () => {
      const res = await request(app)
        .put(`/customer/${customer.id}`)
        .send({
          data: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
          },
        })
        .expect('Content-Type', /json/)
        .expect(200);

      const response = res.body;
      expect(response.rows).toHaveLength(1);
      expect(response.rows[0].firstName).not.toBe(customer.firstName);
      customer = response.rows[0];
    });

    it('the before handler was called first for the route', () => {
      expect(Array.isArray(called.PUT)).toBe(true);
      expect(called.PUT.length).toBeGreaterThanOrEqual(1);
      expect(called.PUT[0]).toBe('before');
    });

    it('the after handler was called second for the route', () => {
      expect(Array.isArray(called.PUT)).toBe(true);
      expect(called.PUT.length).toBeGreaterThanOrEqual(2);
      expect(called.PUT[1]).toBe('after');
    });
  });

  describe('delete tests', () => {
    it('delete a customer', async () => {
      const res = await request(app)
        .delete(`/customer/${customer.id}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.rows).toEqual([]);
      customer = null;
    });

    it('the before handler was called first for the route', () => {
      expect(Array.isArray(called.DELETE)).toBe(true);
      expect(called.DELETE.length).toBeGreaterThanOrEqual(1);
      expect(called.DELETE[0]).toBe('before');
    });

    it('the after handler was called second for the route', () => {
      expect(Array.isArray(called.DELETE)).toBe(true);
      expect(called.DELETE.length).toBeGreaterThanOrEqual(2);
      expect(called.DELETE[1]).toBe('after');
    });

    it('no customers exist after deleting them all', async () => {
      const res = await request(app).get('/customer').expect('Content-Type', /json/).expect(200);

      const response = res.body;
      expect(response.rows).toHaveLength(0);
    });
  });
});
