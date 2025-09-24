"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"

interface Message {
  id: number
  text: string
  sender: "player1" | "player2"
  delay: number
}

const messages: Message[] = [
  { id: 1, text: "♟️ e4", sender: "player1", delay: 1000 },
  { id: 2, text: "♟️ e5", sender: "player2", delay: 2500 },
  { id: 3, text: "♘ Nf3 - Nice opening! 🔥", sender: "player1", delay: 4000 },
]

export function AnimatedChat() {
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([])

  useEffect(() => {
    messages.forEach((message) => {
      setTimeout(() => {
        setVisibleMessages((prev) => [...prev, message])
      }, message.delay)
    })
  }, [])

  return (
    <Card className="w-full max-w-md mx-auto bg-card border-border shadow-lg">
      <div className="p-4 border-b border-border bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full"></div>
          <span className="font-medium">Chess Match</span>
        </div>
      </div>
      <div className="p-4 space-y-3 h-64 overflow-hidden">
        {visibleMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === "player1" ? "justify-end" : "justify-start"} animate-fade-in-up`}
          >
            <div
              className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                message.sender === "player1" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        {visibleMessages.length > 0 && (
          <div className="flex justify-center">
            <div className="flex space-x-1 animate-pulse">
              <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
              <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
              <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
