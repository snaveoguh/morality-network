import { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddressBar } from '../../components/browser/AddressBar';
import { BrowserView, type BrowserViewHandle } from '../../components/browser/BrowserView';
import { TabManager, type Tab } from '../../components/browser/TabManager';

const PAPER = '#F5F0E8';
const INK = '#1A1A1A';
const HOME_URL = 'https://pooter.world';

let nextTabId = 1;
function makeTab(url = HOME_URL): Tab {
  return { id: String(nextTabId++), url, title: '' };
}

export default function BrowserTab() {
  const [tabs, setTabs] = useState<Tab[]>([makeTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [showTabs, setShowTabs] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [displayUrl, setDisplayUrl] = useState(HOME_URL);
  const browserRef = useRef<BrowserViewHandle>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNavigate = useCallback((newUrl: string) => {
    let resolved = newUrl;
    if (!/^https?:\/\//i.test(resolved)) {
      if (/\.\w{2,}/.test(resolved)) {
        resolved = `https://${resolved}`;
      } else {
        resolved = `https://www.google.com/search?q=${encodeURIComponent(resolved)}`;
      }
    }
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, url: resolved } : t)),
    );
  }, [activeTabId]);

  const handlePageMeta = useCallback((meta: { title: string; url: string }) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, title: meta.title } : t)),
    );
    setDisplayUrl(meta.url);
  }, [activeTabId]);

  const handleNavState = useCallback(
    (state: { canGoBack: boolean; canGoForward: boolean; url: string }) => {
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      setDisplayUrl(state.url);
    },
    [],
  );

  const handleNewTab = () => {
    if (tabs.length >= 8) return; // max tabs
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setShowTabs(false);
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return; // keep at least one
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <AddressBar
            url={displayUrl}
            title={activeTab.title}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onNavigate={handleNavigate}
            onGoBack={() => browserRef.current?.goBack()}
            onGoForward={() => browserRef.current?.goForward()}
            onRefresh={() => browserRef.current?.refresh()}
          />
          <TouchableOpacity style={styles.tabCountBtn} onPress={() => setShowTabs(true)}>
            <Text style={styles.tabCountText}>{tabs.length}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.flex}>
          <BrowserView
            ref={browserRef}
            url={activeTab.url}
            onPageMeta={handlePageMeta}
            onNavigationStateChange={handleNavState}
          />
        </View>
      </KeyboardAvoidingView>

      {showTabs && (
        <TabManager
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
          onDismiss={() => setShowTabs(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  tabCountBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: INK,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  tabCountText: { fontSize: 13, fontWeight: '700', color: INK },
});
