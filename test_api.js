const fs = require('fs');

async function runTests() {
  const BASE_URL = 'http://127.0.0.1:5000/api';
  const out = {};
  
  try {
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mustak", email: `mustak${Date.now()}@gmail.com`, password: "123456" })
    });
    out.register = { status: regRes.status, data: await regRes.json() };

    const email = out.register.data.email || "mustak@gmail.com";
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "123456" })
    });
    out.login = { status: loginRes.status, data: await loginRes.json() };

    const token = out.login.data.token || out.register.data.token;
    
    if (token) {
      const landRes = await fetch(`${BASE_URL}/land`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          title: "Land in Attukkulam", price: 500000, state: "Tamil Nadu",
          district: "Madurai", town: "Melur", area: "Attukkulam", description: "Good land"
        })
      });
      out.createLand = { status: landRes.status, data: await landRes.json() };
    }

    const getAllRes = await fetch(`${BASE_URL}/land`);
    out.getAllLands = { status: getAllRes.status, data: await getAllRes.json() };

    const searchRes = await fetch(`${BASE_URL}/land/search?state=Tamil%20Nadu&district=Madurai`);
    out.searchLands = { status: searchRes.status, data: await searchRes.json() };

    fs.writeFileSync('results.json', JSON.stringify(out, null, 2));

  } catch (err) {
    fs.writeFileSync('results.json', JSON.stringify({ error: err.message }));
  }
}
runTests();
