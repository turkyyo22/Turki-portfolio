// The admin area must never show up in search results.
export const metadata = {
  title: "Admin | Turki Aloufi",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
