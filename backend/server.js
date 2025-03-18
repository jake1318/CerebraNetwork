require("dotenv").config();
const express = require("express");
const cors = require("cors");
const searchRoutes = require("./routes/search");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/search", searchRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
