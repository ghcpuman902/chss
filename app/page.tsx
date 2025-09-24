import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AnimatedChat } from "@/components/animated-chat"
import Link from "next/link"

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm font-medium">
                  ♟️ New Game Experience
                </div>
                <h1 className="text-4xl lg:text-6xl font-bold text-balance leading-tight tracking-tight">
                  Play chess over your favourite chatting app
                </h1>
                <p className="text-xl text-muted-foreground text-pretty">No download, no sign up</p>
              </div>

              <div className="space-y-4">
                <Button size="lg" className="text-lg px-8 py-6" asChild>
                  <Link href="/p/">Start a New Game</Link>
                </Button>
                <div className="text-center lg:text-left">
                  <Button variant="link" className="text-muted-foreground hover:text-foreground" asChild>
                    <Link href="/p/?p=b">or start as black →</Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column - Animated Chat */}
            <div className="flex justify-center lg:justify-end">
              <AnimatedChat />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-muted-foreground text-lg">Three simple steps to start playing</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 text-center">
              <div className="w-12 h-12 bg-muted text-muted-foreground rounded-lg flex items-center justify-center mx-auto mb-4 text-2xl">
                💬
              </div>
              <h3 className="font-semibold mb-2">Open Your Chat App</h3>
              <p className="text-muted-foreground text-sm">
                Use WhatsApp, Telegram, Discord, or any messaging platform
              </p>
            </Card>

            <Card className="p-6 text-center">
              <div className="w-12 h-12 bg-muted text-muted-foreground rounded-lg flex items-center justify-center mx-auto mb-4 text-2xl">
                🔗
              </div>
              <h3 className="font-semibold mb-2">Share Game Link</h3>
              <p className="text-muted-foreground text-sm">
                Send the game link to your friend and start playing instantly
              </p>
            </Card>

            <Card className="p-6 text-center">
              <div className="w-12 h-12 bg-muted text-muted-foreground rounded-lg flex items-center justify-center mx-auto mb-4 text-2xl">
                ♟️
              </div>
              <h3 className="font-semibold mb-2">Make Your Moves</h3>
              <p className="text-muted-foreground text-sm">Type moves in chess notation or use our visual board</p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-balance">Ready to challenge your friends?</h2>
            <p className="text-muted-foreground text-lg">
              No apps to download, no accounts to create. Just pure chess fun in your favorite chat.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8 py-6" asChild>
                <Link href="/p/">Start Playing Now</Link>
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6" asChild>
                <Link href="/p/u:e2e4e7e5g1f3">View Example Game</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

    </>
  )
}
