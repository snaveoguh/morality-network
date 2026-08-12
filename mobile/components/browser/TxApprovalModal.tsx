/**
 * Approval sheet for wallet-touching requests coming out of the WebView.
 * Nothing is signed or broadcast until the user explicitly taps Approve here.
 */
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { formatEth } from '../../lib/entity';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

export interface ApprovalRequest {
  /** Host of the page that made the request, e.g. "app.uniswap.org" */
  origin: string;
  method: 'eth_sendTransaction' | 'personal_sign' | 'eth_signTypedData_v4';
  /** eth_sendTransaction fields */
  to?: string;
  valueWei?: bigint;
  data?: string;
  /** Human-readable message (personal_sign) or typed-data JSON preview */
  message?: string;
}

interface Props {
  request: ApprovalRequest | null;
  onApprove: () => void;
  onReject: () => void;
}

const METHOD_TITLES: Record<ApprovalRequest['method'], string> = {
  eth_sendTransaction: 'Send Transaction',
  personal_sign: 'Sign Message',
  eth_signTypedData_v4: 'Sign Typed Data',
};

function truncateMiddle(s: string, max = 120): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max / 2)}…${s.slice(-max / 2)}`;
}

export function TxApprovalModal({ request, onApprove, onReject }: Props) {
  if (!request) return null;
  const isTx = request.method === 'eth_sendTransaction';

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onReject}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{METHOD_TITLES[request.method]}</Text>
          <Text style={styles.origin}>{request.origin}</Text>

          <ScrollView style={styles.details} contentContainerStyle={{ gap: 10 }}>
            {isTx ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>To</Text>
                  <Text style={styles.mono} numberOfLines={1}>
                    {request.to || '(contract creation)'}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Value</Text>
                  <Text style={styles.value}>{formatEth(request.valueWei ?? 0n)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Calldata</Text>
                  <Text style={styles.mono}>
                    {request.data && request.data !== '0x'
                      ? truncateMiddle(request.data, 160)
                      : 'none (plain transfer)'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Message</Text>
                <Text style={styles.message}>
                  {truncateMiddle(request.message || '(empty)', 800)}
                </Text>
              </View>
            )}
          </ScrollView>

          <Text style={styles.warning}>
            Only approve if you trust this site. This request came from a web
            page, not from pooter world.
          </Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.approveBtn} onPress={onApprove}>
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: PAPER,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '80%',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800', color: INK, fontFamily: 'serif' },
  origin: { fontSize: 13, fontWeight: '700', color: ACCENT },
  details: { maxHeight: 260 },
  row: { gap: 2 },
  rowLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#888',
    textTransform: 'uppercase',
  },
  mono: { fontSize: 13, color: INK, fontFamily: 'monospace' },
  value: { fontSize: 18, fontWeight: '800', color: INK },
  message: { fontSize: 13, color: INK, lineHeight: 18 },
  warning: { fontSize: 12, color: '#666', lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rejectBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: INK,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectText: { color: INK, fontWeight: '700', fontSize: 15 },
  approveBtn: {
    flex: 1,
    backgroundColor: INK,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveText: { color: PAPER, fontWeight: '700', fontSize: 15 },
});
