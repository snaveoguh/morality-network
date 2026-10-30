// Authorise the trader's API (agent) wallet on the Hyperliquid main account.
// Run once, AFTER the main account holds USDC on Hyperliquid:
//   node web/scripts/hl-approve-agent.mjs
// Reads both keys from ~/.pooter-hl-main.key and ~/.pooter-hl-agent.key and
// prints addresses only. The agent can trade for the account but cannot
// withdraw.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { privateKeyToAccount } from "viem/accounts";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const read = (name) => readFileSync(`${homedir()}/${name}`, "utf8");
const keyOf = (txt) => txt.match(/^0x[0-9a-fA-F]{64}$/m)?.[0];
const addrOf = (txt) => txt.match(/^# Address: (0x[0-9a-fA-F]{40})$/m)?.[1];

const mainTxt = read(".pooter-hl-main.key");
const agentAddress = addrOf(read(".pooter-hl-agent.key"));
const main = privateKeyToAccount(keyOf(mainTxt));
if (main.address !== addrOf(mainTxt)) throw new Error("main key does not match its recorded address");

const transport = new HttpTransport();
const info = new InfoClient({ transport });
const state = await info.clearinghouseState({ user: main.address });
console.log(`main ${main.address}: account value $${state.marginSummary.accountValue}`);

const res = await new ExchangeClient({ transport, wallet: main }).approveAgent({ agentAddress, agentName: "pooter-trader" });
console.log(`approved agent ${agentAddress}: ${res.status}`);
