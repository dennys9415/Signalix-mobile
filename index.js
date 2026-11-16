// Must run before anything touches crypto.getRandomValues (@noble/* E2EE).
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
