/**
 * Test script for Railway Collector endpoints
 */

const http = require('http');

const baseUrl = 'http://localhost:3001';

async function testEndpoint(path, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`✅ ${path} - Status: ${res.statusCode}`);
          console.log(JSON.stringify(json, null, 2));
          console.log('---');
          resolve({ status: res.statusCode, data: json });
        } catch (error) {
          console.log(`❌ ${path} - Invalid JSON response`);
          console.log(data);
          console.log('---');
          resolve({ status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ ${path} - Error: ${error.message}`);
      reject(error);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function runTests() {
  console.log('🧪 Testing Railway Collector endpoints...\n');
  
  try {
    // Test basic endpoints
    await testEndpoint('/');
    await testEndpoint('/health');
    await testEndpoint('/status');
    await testEndpoint('/ready');
    await testEndpoint('/metrics');
    
    console.log('✅ All endpoint tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
