const router = require("express").Router();

router.get("/", (req, res) => {
    res.send("Hello! This is capstoneII backend api");
});

// 404 Handling
router.use((req, res, next) => {
  const error = new Error("404 Not Found");
  error.status = 404;
  next(error);
});

module.exports = router;