import { defineConfig } from 'vite';
// Local development uses a same-origin proxy. Production must proxy /v1 to the API.
export default defineConfig({server:{proxy:{'/v1':'http://127.0.0.1:3000'}}});
