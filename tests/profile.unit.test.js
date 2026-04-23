// Unit tests for public/scripts/profile.js:
// getInitials, formatJoinedDate, buildProfileInsight, formatLastCheckIn,
// getCenteredSquareCrop, getAvatarFileError, calculateBaseScale,
// clampCropOffsets, createAvatarCropState, getSourceCrop.
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const profileFunctions = loadFunctions("public/scripts/profile.js", [
    "clampValue",
    "getInitials",
    "formatJoinedDate",
    "buildProfileInsight",
    "normalizeThemePreference",
    "isDeleteConfirmationValid",
    "formatLastCheckIn",
    "getCenteredSquareCrop",
    "getAvatarFileError",
    "calculateBaseScale",
    "getRenderedImageSize",
    "clampCropOffsets",
    "createAvatarCropState",
    "getSourceCrop"
], {
    prelude: "const MAX_AVATAR_BYTES = 2 * 1024 * 1024;\nconst DELETE_CONFIRMATION_TEXT = 'DELETE';\nconst DEFAULT_THEME_PREFERENCE = 'light';"
});

module.exports = async function runProfileUnitTests() {
    let failed = 0;

    failed += Number(!(await runTest("profile.js unit tests: getInitials uses the first letters of the first two words", () => {
        assert.equal(profileFunctions.getInitials("Morgan Lee"), "ML");
        assert.equal(profileFunctions.getInitials("single"), "S");
        assert.equal(profileFunctions.getInitials(""), "HT");
    })));

    failed += Number(!(await runTest("profile.js unit tests: formatJoinedDate renders a compact joined label", () => {
        assert.equal(profileFunctions.formatJoinedDate("2026-04-07T12:00:00.000Z"), "Joined Apr 2026");
        assert.equal(profileFunctions.formatJoinedDate("invalid-date"), "Joined recently");
    })));

    failed += Number(!(await runTest("profile.js unit tests: buildProfileInsight adapts to the user's progress", () => {
        assert.match(
            profileFunctions.buildProfileInsight({ totalHabits: 0, completedToday: 0, totalCheckIns: 0 }),
            /have not created any habits yet/i
        );
        assert.match(
            profileFunctions.buildProfileInsight({ totalHabits: 3, completedToday: 2, totalCheckIns: 12 }),
            /checked in 2 habits today/i
        );
        assert.match(
            profileFunctions.buildProfileInsight({ totalHabits: 3, completedToday: 0, totalCheckIns: 0 }),
            /have not logged a check-in yet/i
        );
    })));

    failed += Number(!(await runTest("profile.js unit tests: normalizeThemePreference supports light and dark", () => {
        assert.equal(profileFunctions.normalizeThemePreference("dark"), "dark");
        assert.equal(profileFunctions.normalizeThemePreference(" LIGHT "), "light");
        assert.equal(profileFunctions.normalizeThemePreference("midnight"), "light");
    })));

    failed += Number(!(await runTest("profile.js unit tests: isDeleteConfirmationValid requires the exact confirmation text", () => {
        assert.equal(profileFunctions.isDeleteConfirmationValid("DELETE"), true);
        assert.equal(profileFunctions.isDeleteConfirmationValid(" DELETE "), true);
        assert.equal(profileFunctions.isDeleteConfirmationValid("delete"), false);
    })));

    failed += Number(!(await runTest("profile.js unit tests: formatLastCheckIn handles valid and empty dates", () => {
        assert.equal(profileFunctions.formatLastCheckIn("2026-04-21"), "Last check-in Apr 21, 2026");
        assert.equal(profileFunctions.formatLastCheckIn(""), "No check-ins yet");
    })));

    failed += Number(!(await runTest("profile.js unit tests: getCenteredSquareCrop returns a centered square region", () => {
        assert.deepEqual(
            { ...profileFunctions.getCenteredSquareCrop(1200, 800) },
            { x: 200, y: 0, size: 800 }
        );
        assert.deepEqual(
            { ...profileFunctions.getCenteredSquareCrop(600, 900) },
            { x: 0, y: 150, size: 600 }
        );
    })));

    failed += Number(!(await runTest("profile.js unit tests: getAvatarFileError enforces type and size limits", () => {
        assert.equal(profileFunctions.getAvatarFileError({ type: "image/png", size: 1024 }), "");
        assert.equal(profileFunctions.getAvatarFileError({ type: "image/gif", size: 1024 }), "Choose a PNG, JPEG, or WebP image.");
        assert.equal(profileFunctions.getAvatarFileError({ type: "image/jpeg", size: 3 * 1024 * 1024 }), "Choose an image under 2 MB.");
    })));

    failed += Number(!(await runTest("profile.js unit tests: calculateBaseScale covers the viewport with the image", () => {
        assert.equal(profileFunctions.calculateBaseScale(1200, 800, 280), 0.35);
        assert.equal(profileFunctions.calculateBaseScale(600, 900, 300), 0.5);
    })));

    failed += Number(!(await runTest("profile.js unit tests: clampCropOffsets keeps the crop within image bounds", () => {
        const clamped = profileFunctions.clampCropOffsets(80, -120, 1200, 800, 280, 1, 0.35);
        assert.deepEqual({ ...clamped }, { x: 70, y: 0 });
    })));

    failed += Number(!(await runTest("profile.js unit tests: createAvatarCropState sets sensible crop defaults", () => {
        const crop = profileFunctions.createAvatarCropState(1200, 800, 280);
        assert.equal(crop.zoom, 1);
        assert.equal(crop.offsetX, 0);
        assert.equal(crop.offsetY, 0);
        assert.equal(crop.baseScale, 0.35);
    })));

    failed += Number(!(await runTest("profile.js unit tests: getSourceCrop converts crop state into source image coordinates", () => {
        const crop = {
            width: 1200,
            height: 800,
            viewportSize: 280,
            baseScale: 0.35,
            zoom: 2,
            offsetX: 30,
            offsetY: -20
        };

        assert.deepEqual(
            { ...profileFunctions.getSourceCrop(crop) },
            { x: 157.14285714285714, y: 28.571428571428573, size: 400 }
        );
    })));

    return failed;
};
