import { defineConfig } from 'astro/config';

// Web běží na vlastní subdoméně flek.saiko.cz (vlastní S3 bucket + CloudFront),
// proto base '/' — na rozdíl od sesterských projektů pod cestou na www.saiko.cz.
export default defineConfig({
  site: 'https://flek.saiko.cz',
  base: '/',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
});
