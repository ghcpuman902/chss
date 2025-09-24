import fs from "fs";
import path from "path";
import { cache } from "react";

const loadFont = cache(() => {
	try {
		const interNormalFont = Buffer.from(
			fs.readFileSync(path.resolve("./public/fonts/inter-latin-ext-400-normal.woff")),
		);
		const interBoldFont = Buffer.from(
			fs.readFileSync(path.resolve("./public/fonts/inter-latin-ext-700-normal.woff")),
		);
		console.log("Fonts loaded successfully");
		return { interNormal: interNormalFont, interBold: interBoldFont };
	} catch (error) {
		console.error("Error loading fonts:", error);
		return null;
	}
});

export default loadFont;
