import "../globals.css";

export const metadata = {
  title: "Turki Alofi | Command Center",
  description: "Software Engineer Portfolio",
};

export default async function RootLayout({ children, params }) {

  const { lang } = await params;

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir}>
      <body className="antialiased">{children}</body>
    </html>
  );
}