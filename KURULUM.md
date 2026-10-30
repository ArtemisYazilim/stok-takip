# Stok Takip — Kurulum Rehberi

İşletme yan satış (motor yağı, antifriz vb.) stok ve vardiya takibi uygulaması.

- **Admin**: raf (dışarıdaki) ve **depo** stokunu görür, depoya/rafa alım girer, raf veya depo stokunu düzeltir, vardiya raporlarını ve hareket geçmişini izler, çalışan hesabı açar. Vardiya kapanınca **Bildirim** sekmesine (fark çıksa da çıkmasa da) canlı mesaj düşer.
- **Çalışan**: takvimden nöbet gününü seçip nöbet başlatır, çizelgeye yağ satışlarını (stoktan otomatik düşer) ve pompa sayaçlarını girer, vardiya sonunda sayım yapıp devreder. Sayım ile sistem stoku tutmazsa fark admin panelinde görünür.
- **Geri bildirim**: satış, vardiya kapatma ve hatalarda ses + telefon titreşimi (haptics) verilir.

## 1. Supabase projesi oluştur (bir kere yapılır)

1. https://supabase.com → ücretsiz hesap aç → **New project**.
2. Proje adı: `stok-takip`, bölge: Frankfurt (Türkiye'ye en yakın), güçlü bir veritabanı şifresi belirle (not al).
3. Veritabanını kur (tablolar, tetikleyiciler, yetkiler, fotoğraf deposu, bildirimler). SQL Editor'e bir şey yapıştırmak gerekmez; şema `supabase/migrations/` klasöründeki geçişlerden CLI ile kurulur (bkz. aşağıdaki **Veritabanı geçişleri**):

   ```bash
   npm install
   npx supabase login                          # tarayıcıda Supabase hesabıyla onayla
   npx supabase link --project-ref <proje-ref> # proje ref'i panel adresindeki koddur; DB şifresini sorar
   npm run db:push                             # tüm geçişleri sırayla uygular
   ```
4. Sol menü **Authentication → Sign In / Up → Email** bölümünde **"Confirm email" ayarını KAPAT** (çalışan hesapları sahte e-posta kullandığı için onay maili gidemez).

## Veritabanı geçişleri (Supabase CLI)

Şema değişiklikleri artık SQL Editor'de elle çalıştırılmaz. Her değişiklik `supabase/migrations/` altında zaman damgalı bir SQL dosyasıdır; Supabase uygulanan dosyaları kendi geçmiş tablosunda tutar, `db:push` sadece eksik olanları uygular (Flyway mantığı).

```bash
npm run db:new -- urun_barkodu   # supabase/migrations/<zaman>_urun_barkodu.sql açar, SQL'i içine yaz
npm run db:status                # yerel / canlı geçiş listesini yan yana gösterir
npm run db:push                  # eksik geçişleri canlı veritabanına uygular
```

Bilgisayarda bir kere `npx supabase login` + `npx supabase link --project-ref <proje-ref>` yapılmış olmalı.

**Otomatik uygulama (GitHub Actions):** `master`a push'ta `deploy.yml` önce geçişleri uygular, sonra web'i yayınlar; böylece yeni kod eski şemayla yayına çıkmaz. Bunun için repo ayarlarında **Settings → Secrets and variables → Actions** altına `SUPABASE_DB_URL` secret'ı eklenir: Supabase panelinde **Connect → Session pooler** bağlantı adresi (şifre yerine yazılmış hâli; şifrede özel karakter varsa URL-kodlanmış olmalı). Doğrudan bağlantı (`db.<ref>.supabase.co`) değil **session pooler** kullanılır, çünkü GitHub sunucularında IPv6 yoktur.

> **CLI'dan önce kurulmuş proje (tek seferlik):** İlk iki geçiş (`initial_schema`, `admin_delete_employee`) Supabase geçmişinde zaten kayıtlı. 002–004 ise SQL Editor'den elle çalıştırıldığı için geçmişte yok; tekrar çalıştırılmasın diye uygulanmış olarak işaretlenir, sonra kalanlar (005 ve sonrası) uygulanır:
>
> ```bash
> npx supabase migration repair --status applied 20260720120000 20260915120000 20260916120000
> npm run db:push
> ```

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
2. Çalışan girer → **Nöbet** ekranında takvimden nöbet gününü seçer → **Nöbeti Başlat**.
3. Çizelge açılır. **1. Sayfa (Yağ Satış)** kağıttaki gibidir: depodan rafa ürün çıkarınca **ÇKN** hücresine (depodan düşer; depoda yoksa kabul edilmez), satış oldukça **SATIŞ** hücresine yazıp kaydeder. DVR = önceki BAK + ÇKN, BAK = DVR − SATIŞ kendiliğinden hesaplanır ve BAK ertesi günün DVR'sine geçer. Pompa sayaçlarını **2. Sayfa**ya girer.
4. Vardiya biterken **Vardiyayı Bitir** → rafı sayar → onaylar. Fark varsa kayda geçer.
5. Sonraki çalışan kendi hesabıyla girip yeni vardiya başlatır.
6. Admin **Vardiyalar** sekmesinden her vardiyanın satışını ve sayım farklarını görür.

## Excel'den ürün aktarımı (veri göçü)

Kağıtta/Excel'de duran ürün listesi uygulamaya tek seferde aktarılır:

1. Admin **Stok → Excel'den Aktar** ekranını açar.
2. Excel'de yağ listesini başlık satırıyla (YAĞ ADI, FİYAT, ÇKN, DVR, 1 GN, 2.GN, BAK.) seçip kopyalar, kutuya yapıştırır. Sağdaki pompacı tablosu da kopyalansa sorun olmaz, atlanır.
3. Depo stoku da aktarılacaksa Excel'e **DEPO** başlıklı bir sütun eklenir (kağıtta yoktur). Raf stoku hangi sütundan alınsın seçilir: BAK. doluysa o; dönem ortasıysa **DVR − 1 GN − 2.GN**; ya da "Stoka dokunma" (sadece ad + fiyat + sıra).
4. Önizlemede her satır **Yeni / Güncellenecek / Aynı / Hatalı** olarak görünür; istenmeyen satıra dokunup işaret kaldırılır (fiyatı boş satırlar, ör. grup başlıkları, baştan işaretsizdir).
5. **Aktar**. Aynı adlı ürün güncellenir (Türkçe harf/boşluk farkı önemsiz), yoksa eklenir; ürünler Excel'deki sırayla listelenir. Stok farkları "Düzeltme · Excel aktarımı" hareketi olarak kayda geçer. Excel'de olmayan ürünlere dokunulmaz.

## Depo ve raf

- **Raf** (dışarıdaki) stok pompacının sattığıdır; kağıttaki DVR/BAK budur. **Depo** ayrı tutulur.
- Satın alınan ürün admin tarafından **Ürün → Alım Ekle → Depo** ile depoya girilir. Pompacı çizelgede **ÇKN** yazınca ürün depodan düşüp rafa geçer.
- Depoda kayıtlı ürün yoksa ÇKN kabul edilmez. İlk kurulumda depo stokları Excel aktarımındaki DEPO sütunuyla ya da **Ürün → Stok Düzeltme → Depo** ile girilmelidir.

## Notlar

- Çalışanlar e-posta değil **kullanıcı adı** ile giriş yapar (arka planda `ad@personel.local` sahte e-postasına çevrilir).
- Satışta stok yetersizse sistem satışı reddeder ("Yetersiz stok").
- Her stok değişimi (satış, alım, düzeltme) **Hareketler** ekranında kim/ne zaman bilgisiyle durur; silinemez.
- Android APK çıkarmak (Expo Go olmadan kurulum) istenince: `npx eas build -p android --profile preview` (ücretsiz Expo hesabı gerekir).
