import { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddressBar } from '../../components/browser/AddressBar';
import { BrowserView, type BrowserViewHandle } from '../../components/browser/BrowserView';

const PAPER = '#F5F0E8';
const HOME_URL = 'https://pooter.world';

export default function BrowserTab() {
  const [url, setUrl] = useState(HOME_URL);
  const [displayUrl, setDisplayUrl] = useState(HOME_URL);
  const [title, setTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const browserRef = useRef<BrowserViewHandle>(null);

  const handleNavigate = useCallback((newUrl: string) => {
    let resolved = newUrl;
    if (!/^https?:\/\//i.test(resolved)) {
      if (/\.\w{2,}/.test(resolved)) {
        resolved = `https://${resolved}`;
      } else {
        resolved = `https://www.google.com/search?q=${encodeURIComponent(resolved)}`;
      }
    }
    setUrl(resolved);
  }, []);

  const handlePageMeta = useCallback((meta: { title: string; url: string }) => {
    setTitle(meta.title);
    setDisplayUrl(meta.url);
  }, []);

  const handleNavState = useCallback((state: { canGoBack: boolean; canGoForward: boolean; url: string }) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    setDisplayUrl(state.url);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AddressBar
          url={displayUrl}
          title={title}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onNavigate={handleNavigate}
          onGoBack={() => browserRef.current?.goBack()}
          onGoForward={() => browserRef.current?.goForward()}
          onRefresh={() => browserRef.current?.refresh()}
        />
        <View style={styles.flex}>
          <BrowserView
            ref={browserRef}
            url={url}
            onPageMeta={handlePageMeta}
            onNavigationStateChange={handleNavState}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  flex: { flex: 1 },
});
