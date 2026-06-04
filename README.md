# 📱 Càpsula 4 — Perfil amb GPS i Càmera
 
App mòbil feta amb **React Native + Expo Router** que integra:
- 📍 Localització GPS amb geocodificació inversa
- 📷 Càmera i galeria per a foto d'avatar
- ☁️ Pujada de fotos a **Supabase Storage**
- 🗄️ Guardat de dades a **Supabase Database**
---
 
## 🗂️ Estructura del projecte
 
```
capsula4-perfil/
├── app/
│   ├── _layout.jsx        # Layout arrel (Stack Navigator)
│   └── index.jsx          # Pantalla principal de Perfil
├── lib/
│   └── supabase.js        # Client de Supabase
├── .env                   # variables d'entorn (crea el teu amb les teves dades)
├── app.json               # Configuració Expo + permisos
└── package.json
```
 
---
 
## ⚙️ Configuració pas a pas
 
### 1. Clonar i instal·lar dependències
 
```bash
git clone https://github.com/anastasiaanaya/Capsula4_perfils.git
cd capsula4-perfil
npm install
```
 
### 2. Crear el projecte a Supabase
 
1. Ves a [supabase.com](https://supabase.com) → **New project**
2. Posa un nom i contrasenya de base de dades → **Create project**
3. Un cop creat, ves a **Settings → API**:
   - Copia la **Project URL** (ex: `https://xxxx.supabase.co`)
   - Copia la **anon public key**

### 3. Crear el bucket d'Storage
 
1. Al tauler de Supabase → **Storage → New bucket**
2. Nom: `avatars`
3. Marca **Public bucket** (per tenir URLs públiques sense autenticació)
4. **Save**


### 4. Crear la taula `profiles`
 
Al **SQL Editor** de Supabase, executa:
 
```sql
create table profiles (
  id         bigint generated always as identity primary key,
  username   text,
  avatar_url text,
  address    text,
  latitude   float,
  longitude  float,
  updated_at timestamptz default now()
);
```
 
> Si vols que la taula sigui accessible sense autenticació, afegeix:
> ```sql
> alter table profiles enable row level security;
> create policy "Public access" on profiles for all using (true) with check (true);
> ```
 
### 5. Configurar les variables d'entorn
 
```bash
cp .env.example .env
```
 
Edita `.env` amb les teves credencials:
 
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
 
> ⚠️ El fitxer `.env` **NO** s'ha de pujar a GitHub (ja està al `.gitignore`).
 
### 6. Arrencar l'app
 
```bash
npx expo start
```
 
Escaneja el QR amb **Expo Go** (Android/iOS) en aquest cas amb l'emulador d'Android Studio no podràs comprobar les funcionalitats de l'app perquè no té galeria no accés a localització.
 
---
 
## 📱 Funcionalitats
 
### 📍 GPS i geocodificació inversa
- Demana permís de localització en primer ús
- Obté latitud i longitud actuals
- Converteix les coordenades en adreça llegible (ex: *Carrer Seera de Daró 10, Badalona*)
- Gestiona el cas en que l'usuari denega el permís
### 📷 Càmera i galeria
- Permet escollir entre càmera o galeria
- Retalla la foto en format quadrat (ideal per avatar)
- Mostra la foto immediatament a la pantalla (preview local)
### ☁️ Supabase Storage
- Puja la foto al bucket `avatars`
- Obté l'URL pública permanent
- L'URL es pot obrir des de qualsevol navegador
### 🗄️ Supabase Database
- Guarda nom, URL de l'avatar, adreça i coordenades a la taula `profiles`
---
 
## 🛠️ Tecnologies
 
| Tecnologia | Versió | Ús |
|---|---|---|
| React Native | 0.74 | Framework mòbil |
| Expo Router | ~3.5 | Navegació |
| expo-location | ~17.0 | GPS + geocodificació |
| expo-image-picker | ~15.0 | Càmera i galeria |
| @supabase/supabase-js | ^2.39 | Backend (DB + Storage) |
 
---
 
## 🔐 Permisos requerits
 
| Plataforma | Permís |
|---|---|
| iOS | `NSLocationWhenInUseUsageDescription` |
| iOS | `NSCameraUsageDescription` |
| iOS | `NSPhotoLibraryUsageDescription` |
| Android | `ACCESS_FINE_LOCATION` |
| Android | `CAMERA` |
| Android | `READ_EXTERNAL_STORAGE` |
 
---
 
## 👤 Autora
 
**[Anastasia Anaya Sánchez]** — Projecte de la Càpsula 4  