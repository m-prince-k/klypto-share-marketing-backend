const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 7000,
  path: '/api/strategy/run-scanner',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(JSON.stringify({ strategy_code: 'test' }));
req.end();
