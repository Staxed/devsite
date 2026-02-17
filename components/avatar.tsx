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
          width={260}
          height={260}
          priority={false}
        />
      </div>
    </aside>
  );
}
