import Image from "next/image";

export default function Avatar() {
  return (
    <aside className="avatar-wrap" aria-label="Staxed avatar">
      <div className="avatar-blob-bg" aria-hidden="true" />
      <div className="avatar-orbit" aria-hidden="true" />
      <div className="avatar-gradient-bg">
        <Image
          src="/assets/StaxedDragonAvatar.jpg"
          alt="Staxed dragon avatar"
          fill
          priority
          sizes="(max-width: 480px) 200px, (max-width: 780px) 220px, 260px"
          style={{ objectFit: "cover" }}
        />
      </div>
    </aside>
  );
}
