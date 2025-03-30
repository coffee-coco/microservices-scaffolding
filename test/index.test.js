const request = require('supertest');
const express = require('express');
const app = require('../index');

describe('GET /', () => {
  it('should return Hello World message', (done) => {
    request(app)
      .get('/')
      .expect('Content-Type', /json/)
      .expect(200, { message: 'Hello World' }, done);
  });
});

describe('GET /status', () => {
  it('should return status information', (done) => {
    request(app)
      .get('/status')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        res.body['my-application'][0].should.have.property('description');
        res.body['my-application'][0].should.have.property('version');
        res.body['my-application'][0].should.have.property('sha');
      })
      .end(done);
  });
});