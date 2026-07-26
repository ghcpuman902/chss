# chss.chat

**Play chess over any messaging app. No download, no sign up.**

A database-less, edge-native Next.js application that enables players to share chess games via simple links with beautiful Open Graph previews. Recipients can view the board from their perspective and continue the game by sharing back.

## 🎯 Project Overview

chss.chat is an innovative chess sharing platform that works entirely through URLs and messaging apps. Players make moves, share links, and opponents receive rich previews showing the board from their perspective. The entire game state is encoded in the URL, eliminating the need for databases or user accounts.

### Key Features

- **🔗 URL-Based Game State** - Complete game encoded in shareable links
- **📱 Messaging App Integration** - Works with WhatsApp, Telegram, Discord, etc.
- **🖼️ Rich Open Graph Previews** - Beautiful board images in chat previews
- **⚡ Edge-Native Performance** - Fast OG image generation at the edge
- **🎮 Interactive Chess Board** - Visual piece movement with promotion support
- **📤 Web Share API** - Native sharing on mobile devices
- **🔄 Perspective Switching** - Board shown from opponent's viewpoint
- **♟️ Full Chess Rules** - Complete chess logic with check/checkmate detection

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15** - App Router with Edge Runtime support
- **React 19** - Latest React with concurrent features
- **TypeScript** - Full type safety throughout

### Chess Logic & State
- **chess.js** - Chess game logic and move validation
- **Custom URL encoding** - Compact game state representation
- **UCI notation** - Universal Chess Interface move format

### UI & Styling
- **Tailwind CSS 4** - Utility-first styling with custom chess board styles
- **Shadcn/ui** - High-quality component library
- **Radix UI** - Accessible component primitives
- **Lucide React** - Beautiful icons

### Image Generation
- **@vercel/og** - Edge-optimized Open Graph image generation
- **Satori** - HTML/CSS to image conversion
- **@resvg/resvg-wasm** - SVG rendering engine

### Development & Build
- **Turbopack** - Fast bundler for development and builds
- **ESLint** - Code linting with Next.js configuration
- **pnpm** - Fast, disk space efficient package manager

## 📁 Project Structure

```
chss/
├── app/                          # Next.js App Router
│   ├── globals.css              # Global styles & chess board CSS
│   ├── layout.tsx               # Root layout with metadata
│   ├── page.tsx                 # Landing page with features
│   ├── p/[[...code]]/           # Game pages with dynamic routing
│   │   └── page.tsx             # Chess board display & interaction
│   └── og/[[...code]]/          # Open Graph image generation
│       ├── route.tsx            # OG image API endpoint
│       └── og-template.tsx      # OG image React template
├── components/                   # Reusable React components
│   ├── chess-board.tsx          # Interactive chess board component
│   ├── pieces.tsx               # SVG chess piece components
│   ├── turn-indicator.tsx       # Game status indicator
│   ├── link-unfurl.tsx          # Landing page chat link-preview demo
│   ├── floating-title.tsx       # Floating site title
│   ├── footer.tsx               # Site footer
│   ├── providers.tsx            # React context providers
│   └── ui/                      # Shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── popover.tsx
│       └── tooltip.tsx
├── lib/                         # Utility libraries
│   ├── state.ts                 # Game state management & URL encoding
│   ├── utils.ts                 # General utilities
│   ├── piece-svg-cache.ts       # SVG piece caching for OG images
│   ├── font-loader.ts           # Font loading utilities
│   ├── keys.json                # Pre-computed position mappings
│   └── fen_counts.json          # Position frequency data
├── public/                      # Static assets
│   ├── *.svg                    # Chess piece SVG files
│   ├── fonts/                   # Web fonts
│   └── *.png                    # App icons & manifests
├── scripts/                     # Build scripts
│   ├── build-fen-counts.js      # Generate position frequency data
│   ├── build-fen-counts-from-lichess.js
│   └── build-fen-keys.js        # Generate position key mappings
└── Configuration files
    ├── package.json             # Dependencies & scripts
    ├── next.config.ts           # Next.js configuration
    ├── tsconfig.json            # TypeScript configuration
    ├── tailwind.config.js       # Tailwind CSS configuration
    ├── postcss.config.mjs       # PostCSS configuration
    └── eslint.config.mjs        # ESLint configuration
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** - Required for Next.js 15
- **pnpm** - Package manager (recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chss
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start the development server**
   ```bash
   pnpm dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📜 Available Scripts

### Development
- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build production application
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint code analysis

### Data Generation
- `pnpm build:fen:counts` - Generate position frequency data
- `pnpm build:fen:counts-lichess` - Generate data from Lichess database
- `pnpm build:fen:keys` - Generate position key mappings

## 🎮 How It Works

### Game Flow
1. **Start Game** - Visit `/p/` for a new game or `/p/?p=b` to start as black
2. **Make Moves** - Click pieces and squares to move, with visual feedback
3. **Share Position** - Use the share button to send the game link
4. **Opponent Views** - Link shows board from opponent's perspective
5. **Continue Game** - Opponent makes move and shares back

### URL Encoding Formats

The application supports multiple URL encoding formats for maximum flexibility:

- **Empty Board**: `/p/` - Starting position
- **UCI Moves**: `/p/e2e4e7e5` - Raw UCI notation
- **Short Keys**: `/p/u-abc123` - Pre-computed position keys
- **FEN Encoding**: `/p/f-<base64url>` - Full FEN string encoding

### Open Graph Images

OG images are generated dynamically at `/og/<code>.png` with:
- **800x800 resolution** - Square format for universal compatibility
- **Edge caching** - Immutable cache headers for performance
- **Perspective-aware** - Shows board from recipient's viewpoint
- **SVG-based pieces** - Crisp rendering at any size

## 🎨 Key Features Deep Dive

### Interactive Chess Board
- **Visual piece selection** - Click to select, click to move
- **Legal move indicators** - Green dots show valid moves
- **Last move highlighting** - Yellow highlighting for move history
- **Promotion handling** - Popup selector for pawn promotions
- **Check indicators** - Visual feedback for check/checkmate states

### State Management
- **Browser history integration** - Back button undoes moves
- **URL synchronization** - Game state always matches URL
- **Undo functionality** - One-click move reversal
- **Perspective switching** - Query parameter controls board orientation

### Performance Optimizations
- **OG image prewarming** - Background requests to warm cache
- **Compact URL encoding** - Minimal URL length for sharing
- **Edge runtime** - Fast response times globally
- **SVG caching** - Efficient piece rendering in OG images

## 🔧 Configuration

### Environment Variables
```bash
# .env.local
NEXT_PUBLIC_BASE_URL=https://chss.chat
VERCEL_URL=your-deployment-url
```

### Next.js Configuration
The app is configured for:
- **Edge runtime** - Optimal performance
- **Turbopack** - Fast development builds
- **Static optimization** - Pre-rendered pages where possible

### Tailwind CSS
Custom chess board styles in `app/globals.css`:
- **Board layout** - CSS Grid 8x8 layout
- **Square styling** - Light/dark square colors
- **Piece animations** - Hover and selection effects
- **Check indicators** - King in check animations

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Deploy to Vercel
vercel --prod

# Or connect your Git repository for automatic deployments
```

### Other Platforms
The application is compatible with any platform supporting:
- **Next.js 15** - App Router and Edge Runtime
- **Node.js 18+** - Runtime environment
- **Static file serving** - For assets and fonts

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **Make your changes** - Follow the existing code style
4. **Add tests** - Ensure functionality works correctly
5. **Commit changes** - `git commit -m 'Add amazing feature'`
6. **Push to branch** - `git push origin feature/amazing-feature`
7. **Open a Pull Request** - Describe your changes

### Development Guidelines
- **TypeScript** - Maintain type safety
- **Component patterns** - Follow existing component structure
- **CSS classes** - Use Tailwind utilities consistently
- **Accessibility** - Ensure keyboard navigation and screen reader support

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **chess.js** - Robust chess game logic
- **Vercel** - Excellent hosting and OG image generation
- **Tailwind CSS** - Beautiful, maintainable styling
- **Shadcn/ui** - High-quality component library
- **Next.js team** - Amazing framework and developer experience

---

**Built with ❤️ for chess enthusiasts everywhere**

Visit [chss.chat](https://chss.chat) to start playing!