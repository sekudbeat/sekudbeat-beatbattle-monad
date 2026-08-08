// Reproduces the exact browser login flow (nonce -> sign -> verify -> profile/me)
// against the live Vercel deployment, to see the raw response at whichever
// step fails. Uses the wallet key already in .env.local (from the Monad
// deployment step) — never printed.
require("dotenv").config({ path: ".env.local", quiet: true });
const { ethers } = require("ethers");

const BASE = "https://sekudbeat-beatbattle-monad.vercel.app";

async function dump(label, res) {
  const text = await res.text();
  console.log(`\n[${label}] status=${res.status} content-type=${res.headers.get("content-type")}`);
  console.log(text.slice(0, 500));
  return text;
}

async function main() {
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY);
  const address = wallet.address;
  console.log("Testing as:", address);

  let cookie = "";
  function headers(extra) {
    const h = { "Content-Type": "application/json", ...(extra || {}) };
    if (cookie) h.Cookie = cookie;
    return h;
  }

  let res = await fetch(BASE + "/api/auth/nonce", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ address }),
  });
  const nonceText = await dump("nonce", res);
  const setCookie1 = res.headers.get("set-cookie");
  if (setCookie1) cookie = setCookie1.split(";")[0];
  let message;
  try { message = JSON.parse(nonceText).message; } catch (e) { console.log("nonce did not return JSON — stopping."); return; }

  const signature = await wallet.signMessage(message);

  res = await fetch(BASE + "/api/auth/verify", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ address, signature }),
  });
  const verifyText = await dump("verify", res);
  const setCookie2 = res.headers.get("set-cookie");
  if (setCookie2) cookie = setCookie2.split(";")[0];

  res = await fetch(BASE + "/api/profile/me", { headers: headers() });
  await dump("profile/me", res);

  res = await fetch(BASE + "/api/leaderboard?difficulty=rookie");
  await dump("leaderboard", res);
}

main().catch((e) => console.error("SCRIPT ERROR:", e.message));
