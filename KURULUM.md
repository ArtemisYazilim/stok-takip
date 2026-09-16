# Stok Takip — Kurulum Rehberi

İşletme yan satış (motor yağı, antifriz vb.) stok ve vardiya takibi uygulaması.

- **Admin**: stok görür, ürüne **fotoğraf** ekler, alım girer, stok düzeltir, vardiya raporlarını ve hareket geçmişini izler, çalışan hesabı açar. Vardiya kapanınca **Bildirim** sekmesine (fark çıksa da çıkmasa da) canlı mesaj düşer.
- **Çalışan**: vardiya başlatır, satış yapar (stoktan otomatik düşer), vardiya sonunda sayım yapıp devreder. Sayım ile sistem stoku tutmazsa fark admin panelinde görünür.
- **Geri bildirim**: satış, vardiya kapatma ve hatalarda ses + telefon titreşimi (haptics) verilir.

## 1. Supabase projesi oluştur (bir kere yapılır)

1. https://supabase.com → ücretsiz hesap aç → **New project**.
2. Proje adı: `stok-takip`, bölge: Frankfurt (Türkiye'ye en yakın), güçlü bir veritabanı şifresi belirle (not al).
3. Proje açılınca sol menüden **SQL Editor** → **New query** → bu depodaki `supabase/schema.sql` dosyasının **tamamını** yapıştır → **Run**. Hata vermeden bitmeli. (Bu dosya ürün fotoğrafı deposu ve bildirimleri de kurar.)
4. Sol menü **Authentication → Sign In / Up → Email** bölümünde **"Confirm email" ayarını KAPAT** (çalışan hesapları sahte e-posta kullandığı için onay maili gidemez).

> **Zaten kurulu projeniz varsa** (schema.sql'i daha önce çalıştırdıysanız): fotoğraf + bildirim özelliklerini eklemek için SQL Editor'de **`supabase/002_gelistirmeler.sql`** dosyasının tamamını çalıştırın. Tekrar çalıştırılabilir, mevcut veriye dokunmaz.
>
> Sonraki geçişler de aynı şekilde SQL Editor'de sırayla çalıştırılır (hepsi idempotent):
> - `supabase/003_urun_silme.sql` — ürün silme RPC'si
> - `supabase/004_notlar_ve_vardiya_izni.sql` — çalışan not defteri, vardiya açma izni ve satışta iade desteği

## 2. Admin hesabını aç

1. Supabase panelinde **Authentication → Users → Add user → Create new user**.
2. Kendi e-postanı ve şifreni gir, **Auto Confirm User** işaretli olsun.
3. **SQL Editor**'de şunu çalıştır (e-postayı kendi e-postanla değiştir):

```sql
update public.profiles
set role = 'admin', full_name = 'Admin'
where id = (select id from auth.users where email = 'seninmail@ornek.com');
```

## 3. Uygulamayı bağla

1. Supabase panelinde **Project Settings → API** → `Project URL` ve `anon public` anahtarını kopyala.
2. Proje kökünde `.env.example` dosyasını `.env` adıyla kopyala, iki değeri yapıştır.

## 4. Çalıştır

```bash
npm install
npm start          # Expo dev sunucusu; telefonda Expo Go ile QR okut
npm run web        # tarayıcıda çalıştır (masaüstü / iPhone için)
```

Telefonda test: Play Store'dan **Expo Go** uygulamasını indir, terminaldeki QR kodu okut (telefon ve bilgisayar aynı WiFi'de olmalı).

## 5. Günlük kullanım akışı

1. Admin uygulamada **Çalışanlar** sekmesinden çalışan hesabı açar (kullanıcı adı + şifre).
2. Çalışan girer → **Vardiya → Vardiyayı Başlat**.
3. Satış oldukça **Satış** sekmesinden ürünleri seçip kaydeder; stok anında düşer.
4. Vardiya biterken **Vardiyayı Bitir** → rafı sayar → onaylar. Fark varsa kayda geçer.
5. Sonraki çalışan kendi hesabıyla girip yeni vardiya başlatır.
6. Admin **Vardiyalar** sekmesinden her vardiyanın satışını ve sayım farklarını görür.

## Notlar

- Çalışanlar e-posta değil **kullanıcı adı** ile giriş yapar (arka planda `ad@personel.local` sahte e-postasına çevrilir).
- Satışta stok yetersizse sistem satışı reddeder ("Yetersiz stok").
- Her stok değişimi (satış, alım, düzeltme) **Hareketler** ekranında kim/ne zaman bilgisiyle durur; silinemez.
- Android APK çıkarmak (Expo Go olmadan kurulum) istenince: `npx eas build -p android --profile preview` (ücretsiz Expo hesabı gerekir).
