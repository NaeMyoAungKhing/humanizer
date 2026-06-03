// Pre-build step: copy /profiles and /assets into /public so Vite serves them as
// static files at the same paths the React component fetches them from.
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs'

mkdirSync('public', { recursive: true })

if (existsSync('public/profiles')) rmSync('public/profiles', { recursive: true, force: true })
if (existsSync('public/assets'))   rmSync('public/assets',   { recursive: true, force: true })

if (existsSync('profiles')) cpSync('profiles', 'public/profiles', { recursive: true })
if (existsSync('assets'))   cpSync('assets',   'public/assets',   { recursive: true })

console.log('Copied profiles/ and assets/ into public/')
