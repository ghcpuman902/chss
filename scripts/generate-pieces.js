const fs = require('fs');
const path = require('path');

// Define the piece names and their corresponding SVG files
const pieces = [
  { name: 'Pawn', file: 'Pawn.svg' },
  { name: 'Rook', file: 'Rook.svg' },
  { name: 'Knight', file: 'Knight.svg' },
  { name: 'Bishop', file: 'Bishop.svg' },
  { name: 'Queen', file: 'Queen.svg' },
  { name: 'King', file: 'King.svg' }
];

// Function to process SVG content
function processSVGContent(svgContent) {
  // Extract the SVG element content (everything between <svg> and </svg>)
  const svgMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!svgMatch) {
    throw new Error('No SVG element found');
  }
  
  let innerContent = svgMatch[1];
  
  // Remove XML comments
  innerContent = innerContent.replace(/<!--[\s\S]*?-->/g, '');
  
  // Clean up the content
  innerContent = innerContent.trim();
  
  // Helper to add fill to both self-closing and non-self-closing tags
  const addFill = (tag) => {
    // Self-closing first: <tag ... /> → <tag ... fill="currentColor" />
    innerContent = innerContent.replace(new RegExp(`<${tag}([^>]*)\\/>`, 'g'), (match, attrs) => {
      if (/\bfill=/.test(attrs)) return `<${tag}${attrs} />`;
      return `<${tag}${attrs} fill="currentColor" />`;
    });

    // Then normal open tags: <tag ...> → <tag ... fill="currentColor">
    innerContent = innerContent.replace(new RegExp(`<${tag}([^>]*)>`, 'g'), (match, attrs) => {
      if (/\bfill=/.test(attrs)) return `<${tag}${attrs}>`;
      return `<${tag}${attrs} fill="currentColor">`;
    });
  };

  addFill('path');
  addFill('polygon');
  
  return innerContent;
}

// Function to generate React component
function generatePieceComponent(pieceName, svgContent) {
  const componentName = `${pieceName}Icon`;
  const processedContent = processSVGContent(svgContent);
  
  return `export const ${componentName}: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      ${processedContent}
    </svg>
  );
};`;
}

// Main function
function generatePiecesFile() {
  const publicDir = path.join(__dirname, '..', 'public');
  const outputFile = path.join(__dirname, '..', 'components', 'pieces.tsx');
  
  let fileContent = `import * as React from 'react';

export type PieceIconProps = React.SVGProps<SVGSVGElement> & { title?: string };

`;

  pieces.forEach(piece => {
    const svgPath = path.join(publicDir, piece.file);
    
    try {
      console.log(`Processing ${piece.file}...`);
      const svgContent = fs.readFileSync(svgPath, 'utf8');
      const component = generatePieceComponent(piece.name, svgContent);
      fileContent += component + '\n\n';
    } catch (error) {
      console.error(`Error processing ${piece.file}:`, error.message);
    }
  });

  // Write the generated file
  fs.writeFileSync(outputFile, fileContent);
  console.log(`Generated pieces.tsx with ${pieces.length} components`);
}

// Run the script
generatePiecesFile();