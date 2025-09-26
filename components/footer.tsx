import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">♟️</span>
            <span className="font-semibold">chss.chat</span>
          </div>
          <div className="flex flex-col items-center md:items-start md:flex-row gap-2 text-sm text-muted-foreground"><span>© {new Date().getFullYear()}</span><span><Link href="https://chss.chat" className="underline">chss.chat</Link></span><span>Play chess with your friends, in any messaging app.</span></div>
        </div>
      </div>
    </footer>
  );
};
