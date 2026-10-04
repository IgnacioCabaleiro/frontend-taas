import { createRoot } from 'react-dom/client'
import App from './App'
import './design/tokens.css'
import './design/components/bundle.css'
import './app.css'

createRoot(document.getElementById('root')!).render(<App />)
