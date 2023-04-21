const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let dataBase = null;

const initializeDbAndServer = async () => {
  try {
    dataBase = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (error) {
    console.log(`DataBase Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertSnakeIntoCamel = (each_obj) => {
  return {
    stateId: each_obj.state_id,
    stateName: each_obj.state_name,
    population: each_obj.population,
    districtId: each_obj.district_id,
    stateId: each_obj.state_id,
    districtName: each_obj.district_name,
    cases: each_obj.cases,
    cured: each_obj.cured,
    active: each_obj.active,
    deaths: each_obj.deaths,
  };
};

//create user account API

app.post("/profile/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const isUserAvailableQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const findUser = await dataBase.get(isUserAvailableQuery);
  if (findUser === undefined) {
    //create User
    const addUserQuery = `
    INSERT INTO
        user(username, name, password, gender, location)
    VALUES(
        '${username}',
        '${name}',
        '${password}',
        '${gender}',
        '${location}'
    )`;
    const addUser = await dataBase.run(addUserQuery);
    response.send("User Created Successfully.!!");
  } else {
    response.status(400);
    response.send("Invalid Username.!");
  }
});

const validateToken = (request, response, next) => {
  let jsonToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jsonToken = authHeader.split(" ")[1];
  }
  if (jsonToken === undefined) {
    response.status(401);
    response.send(" Invalid JWT Token");
  } else {
    jwt.verify(jsonToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send(" Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//1.login user

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await dataBase.get(checkUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jsonToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jsonToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//2.list of all states API

app.get("/states/", validateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state`;
  const statesList = await dataBase.all(getStatesQuery);
  response.send(statesList.map((eachObj) => convertSnakeIntoCamel(eachObj)));
});

//3. state based on the state ID - API

app.get("/states/:stateId/", validateToken, async (request, response) => {
  const { stateId } = request.params;
  const getSpeStateQuery = `SELECT * FROM state WHERE state_id = '${stateId}'`;
  const getSpeState = await dataBase.get(getSpeStateQuery);
  response.send(convertSnakeIntoCamel(getSpeState));
});

//4.add district to dataBase API

app.post("/districts/", validateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistQuery = `
  INSERT INTO
    district(district_name, state_id, cases, cured, active, deaths)
  VALUES(
      '${districtName}',
      '${stateId}',
      '${cases}',
      '${cured}',
      '${active}',
      '${deaths}')`;
  await dataBase.run(addDistQuery);
  response.send("District Successfully Added");
});

//5.Returns a district based on the district ID - API

app.get("/districts/:districtId/", validateToken, async (request, response) => {
  const { districtId } = request.params;
  const getDistrictQuery = `
  SELECT
  district_id AS districtId,
    district_name AS districtName,
    state_id AS stateId,
    cases AS cases,
    cured AS cured,
    active AS active,
    deaths AS deaths
  FROM
     district 
  WHERE 
    district_id = '${districtId}'`;
  const getDistrict = await dataBase.get(getDistrictQuery);
  response.send(getDistrict);
});

//6. Delete specific dist API

app.delete(
  "/districts/:districtId/",
  validateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `DELETE FROM district WHERE district_id = '${districtId}'`;
    await dataBase.run(deleteQuery);
    response.send("District Removed");
  }
);

//7.update district API

app.put("/districts/:districtId/", validateToken, async (request, response) => {
  const { districtId } = request.params;
  const latestDist = request.body;
  const { districtName, stateId, cases, cured, active, deaths } = latestDist;
  const updateDistQuery = `
  UPDATE 
    district
  SET
      district_name = '${districtName}',
      state_id = '${stateId}',
      cases = '${cases}',
      cured = '${cured}',
      active = '${active}',
      deaths = '${deaths}'
  WHERE
    district_id = '${districtId}'`;
  await dataBase.run(updateDistQuery);
  response.send("District Details Updated");
});

//8.statistics API

app.get("/states/:stateId/stats/", validateToken, async (request, response) => {
  const { stateId } = request.params;
  const statisticsQuery = `
  SELECT 
    SUM(cases) AS totalCases,
    SUM(cured) AS totalCured,
    SUM(active) AS totalActive,
    SUM(deaths) AS totalDeaths
  FROM
    district
  WHERE
    district_id = '${stateId}'`;
  const totalStatistics = await dataBase.get(statisticsQuery);
  response.send(totalStatistics);
});

module.exports = app;
