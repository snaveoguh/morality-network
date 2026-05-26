import { createPublicClient, http, type Client, type Chain, type Transport } from "viem";
import { base } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { baseRpcUrl, pimlicoUrl } from "./config";

let _publicClient: Client<Transport, Chain> | null = null;
export function basePublicClient(): Client<Transport, Chain> {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: base, transport: http(baseRpcUrl()) });
  }
  return _publicClient;
}

let _pimlicoClient: ReturnType<typeof createPimlicoClient> | null = null;
export function pimlicoBaseClient() {
  if (!_pimlicoClient) {
    _pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl(base.id)),
      entryPoint: { address: entryPoint07Address, version: "0.7" },
    });
  }
  return _pimlicoClient;
}
