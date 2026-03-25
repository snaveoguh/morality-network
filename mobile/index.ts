// Polyfills — must be first
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import 'expo-router/entry';
