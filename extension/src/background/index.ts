import { initRpc, setRpcUrl, getRpcUrl, getPublicClient } from '../shared/rpc';
import {
  createNewWallet, importWallet, unlockWallet, lockWallet,
  getWalletInfo, hasWallet, getAccount
} from '../shared/wallet';
import { fetchEntityData, fetchComments } from './rpc-handler';
import { rateEntity, rateEntityWithReason, submitComment, tipEntity, tipComment, voteComment, sendEth } from './wallet-handler';
import type { Message, MessageResponse } from '../shared/types';
import { CHAIN_ID } from '../shared/constants';
import { formatEther, parseEther, type Hex } from 'viem';
import { createWallet as createWalletClient } from '../shared/rpc';

// Initialize RPC on service worker start
initRpc();

// ============================================================================
// MESSAGE ROUTER
// ============================================================================

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message || String(err) }));
    return true; // async response
  }
);

async function handleMessage(msg: Message): Promise<MessageResponse> {
  switch (msg.type) {
    // ─── READS ───
    case 'GET_ENTITY_DATA': {
      const data = await fetchEntityData(msg.identifier);
      return { ok: true, data };
    }
    case 'GET_COMMENTS': {
      const comments = await fetchComments(msg.entityHash, msg.offset, msg.limit);
      return { ok: true, data: comments };
    }
    case 'GET_CURRENT_PAGE_DATA': {
      // Handled by popup — get active tab URL, fetch entity data
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const data = await fetchEntityData(tab.url);
        return { ok: true, data };
      }
      return { ok: false, error: 'No active tab' };
    }

    // ─── WRITES ───
    case 'RATE_ENTITY': {
      const hash = await rateEntity(msg.entityHash, msg.score);
      return { ok: true, data: { txHash: hash } };
    }
    case 'RATE_WITH_REASON': {
      const hash = await rateEntityWithReason(msg.entityHash, msg.score, msg.reason);
      return { ok: true, data: { txHash: hash } };
    }
    case 'SUBMIT_COMMENT': {
      const hash = await submitComment(msg.entityHash, msg.content, msg.parentId);
      return { ok: true, data: { txHash: hash } };
    }
    case 'TIP_ENTITY': {
      const hash = await tipEntity(msg.entityHash, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }
    case 'TIP_COMMENT': {
      const hash = await tipComment(msg.commentId, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }
    case 'VOTE_COMMENT': {
      const hash = await voteComment(msg.commentId, msg.vote);
      return { ok: true, data: { txHash: hash } };
    }
    case 'SEND_ETH': {
      const hash = await sendEth(msg.to, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }

    // ─── WALLET ───
    case 'GET_WALLET_INFO': {
      const info = await getWalletInfo();
      return { ok: true, data: info };
    }
    case 'CREATE_WALLET': {
      const address = await createNewWallet(msg.password);
      return { ok: true, data: { address } };
    }
    case 'IMPORT_WALLET': {
      const address = await importWallet(msg.privateKey, msg.password);
      return { ok: true, data: { address } };
    }
    case 'UNLOCK_WALLET': {
      const address = await unlockWallet(msg.password);
      return { ok: true, data: { address } };
    }
    case 'LOCK_WALLET': {
      lockWallet();
      return { ok: true };
    }

    // ─── SETTINGS ───
    case 'SET_RPC_URL': {
      setRpcUrl(msg.url);
      return { ok: true };
    }
    case 'GET_SETTINGS': {
      return { ok: true, data: { rpcUrl: getRpcUrl() } };
    }

    // ─── EIP-1193 PROVIDER ───
    case 'EIP1193_REQUEST': {
      const result = await handleEip1193(msg.method, msg.params);
      return { ok: true, data: result };
    }

    default:
      return { ok: false, error: `Unknown message type` };
  }
}

// ============================================================================
// EIP-1193 HANDLER — processes standard Ethereum JSON-RPC methods
// ============================================================================

async function handleEip1193(method: string, params: unknown[]): Promise<unknown> {
  const account = getAccount();
  const client = getPublicClient();
  const chainIdHex = '0x' + CHAIN_ID.toString(16);

  switch (method) {
    // ─── Account methods ───
    case 'eth_requestAccounts':
    case 'eth_accounts': {
      if (!account) return [];
      return [account.address];
    }

    case 'eth_chainId': {
      return chainIdHex;
    }

    case 'net_version': {
      return String(CHAIN_ID);
    }

    // ─── Signing ───
    case 'personal_sign': {
      if (!account) throw new Error('Wallet is locked');
      const [message, _address] = params as [Hex, string];
      // personal_sign: first param is the message, second is address
      const signature = await account.signMessage({
        message: { raw: message },
      });
      return signature;
    }

    case 'eth_sign': {
      if (!account) throw new Error('Wallet is locked');
      const [_addr, data] = params as [string, Hex];
      const signature = await account.signMessage({
        message: { raw: data },
      });
      return signature;
    }

    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      if (!account) throw new Error('Wallet is locked');
      const [_signerAddr, typedDataStr] = params as [string, string];
      const typedData = typeof typedDataStr === 'string' ? JSON.parse(typedDataStr) : typedDataStr;
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      return signature;
    }

    // ─── Transactions ───
    case 'eth_sendTransaction': {
      if (!account) throw new Error('Wallet is locked');
      const [txParams] = params as [{ to: string; value?: string; data?: string; gas?: string; gasPrice?: string }];
      const walletClient = createWalletClient(account);
      const hash = await walletClient.sendTransaction({
        to: txParams.to as Hex,
        value: txParams.value ? BigInt(txParams.value) : undefined,
        data: txParams.data as Hex | undefined,
        gas: txParams.gas ? BigInt(txParams.gas) : undefined,
      });
      return hash;
    }

    // ─── Read methods — proxy to RPC ───
    case 'eth_getBalance': {
      const [address, block] = params as [string, string?];
      const balance = await client.getBalance({
        address: address as Hex,
        blockTag: (block as any) || 'latest',
      });
      return '0x' + balance.toString(16);
    }

    case 'eth_blockNumber': {
      const blockNumber = await client.getBlockNumber();
      return '0x' + blockNumber.toString(16);
    }

    case 'eth_getTransactionCount': {
      const [addr, blockTag] = params as [string, string?];
      const nonce = await client.getTransactionCount({
        address: addr as Hex,
        blockTag: (blockTag as any) || 'latest',
      });
      return '0x' + nonce.toString(16);
    }

    case 'eth_call': {
      const [callParams, blockTag] = params as [{ to: string; data?: string; from?: string; value?: string }, string?];
      const result = await client.call({
        to: callParams.to as Hex,
        data: callParams.data as Hex | undefined,
        account: callParams.from as Hex | undefined,
        value: callParams.value ? BigInt(callParams.value) : undefined,
        blockTag: (blockTag as any) || 'latest',
      });
      return result.data || '0x';
    }

    case 'eth_estimateGas': {
      const [gasParams] = params as [{ to?: string; data?: string; from?: string; value?: string }];
      const gas = await client.estimateGas({
        to: gasParams.to as Hex | undefined,
        data: gasParams.data as Hex | undefined,
        account: (gasParams.from || account?.address) as Hex | undefined,
        value: gasParams.value ? BigInt(gasParams.value) : undefined,
      });
      return '0x' + gas.toString(16);
    }

    case 'eth_getCode': {
      const [codeAddr, codeBlock] = params as [string, string?];
      const code = await client.getCode({
        address: codeAddr as Hex,
        blockTag: (codeBlock as any) || 'latest',
      });
      return code || '0x';
    }

    case 'eth_gasPrice': {
      const gasPrice = await client.getGasPrice();
      return '0x' + gasPrice.toString(16);
    }

    case 'eth_getTransactionReceipt': {
      const [txHash] = params as [string];
      const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
      return receipt;
    }

    case 'eth_getBlockByNumber': {
      const [blockNum, includeTx] = params as [string, boolean];
      const block = await client.getBlock({
        blockTag: (blockNum as any) || 'latest',
        includeTransactions: !!includeTx,
      });
      return block;
    }

    // ─── Wallet-specific ───
    case 'wallet_switchEthereumChain': {
      const [{ chainId: requestedChainId }] = params as [{ chainId: string }];
      if (requestedChainId !== chainIdHex) {
        throw { code: 4902, message: `pooter world only supports Base Sepolia (${chainIdHex})` };
      }
      return null;
    }

    case 'wallet_addEthereumChain': {
      // Accept silently if it's our chain, reject otherwise
      return null;
    }

    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

// Log startup
console.log('pooter world service worker started');
