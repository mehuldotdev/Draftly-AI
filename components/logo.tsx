import Link from "next/link";
import Image from "next/image";

const Logo = () => {
  return (
    <Link href="/" className="flex-1 flex items-center gap-2">
      <Image 
        src="/logo.png" 
        alt="Draftly Logo" 
        width={32} 
        height={32} 
        className="object-contain"
      />
      
      <span className="text-xl font-bold tracking-tight text-foreground">
        Draftly<span className="text-primary">.ai</span>
      </span>
    </Link>
  );
};

export default Logo;