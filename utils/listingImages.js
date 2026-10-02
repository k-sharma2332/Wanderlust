const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const ExpressError = require("./expressError");

const imageDirectory = path.join(__dirname, "..", "public", "uploads", "listings");
const formats = [
    { extension: "jpg", matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { extension: "png", matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { extension: "webp", matches: (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" }
];

const getImageFormat = (buffer) => formats.find((format) => format.matches(buffer));

module.exports.storeListingImages = async (files = []) => {
    const stored = [];
    try {
        await fs.mkdir(imageDirectory, { recursive: true });
        for (const file of files) {
            const format = getImageFormat(file.buffer);
            if (!format) {
                throw new ExpressError(400, "An uploaded file is not a valid JPEG, PNG, or WebP image.");
            }
            const filename = `${randomUUID()}.${format.extension}`;
            await fs.writeFile(path.join(imageDirectory, filename), file.buffer, { flag: "wx" });
            stored.push({ url: `/uploads/listings/${filename}`, filename });
        }
        return stored;
    } catch (error) {
        for (const image of stored) {
            try {
                await fs.unlink(path.join(imageDirectory, image.filename));
            } catch (cleanupError) {
                console.error("Failed to clean up an incomplete listing image upload.", cleanupError);
            }
        }
        throw error;
    }
};

module.exports.deleteListingImages = async (images = []) => {
    for (const image of images) {
        if (!image || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(image.filename || "")) continue;
        try {
            await fs.unlink(path.join(imageDirectory, image.filename));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
};
