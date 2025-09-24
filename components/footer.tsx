export const Footer = () => {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">♟️</span>
            <span className="font-semibold">chss.chat</span>
          </div>
          <div className="text-sm text-muted-foreground">© 2024 chss.chat. Play chess anywhere, anytime.</div>
        </div>
      </div>
    </footer>
  );
};
