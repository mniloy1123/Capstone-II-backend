const express = require("express");
const router = express.Router();
const { Octokit } = require("octokit");
require("dotenv").config();

const octokit = new Octokit({
  auth: process.env.GITHUB_ACCESS_TOKEN,
});

//helper functions
//send api request to get the data of merge commits based on the sha
async function impactFilter(ownerOfRepo, repository, shaString) {
  const files = [];
  const changeStats = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{sha}",
    {
      owner: ownerOfRepo,
      repo: repository,
      sha: shaString,
    }
  );
  changeStats.data.files.forEach((fileData) => {
    const fileObject = {
      changes: fileData.changes,
      additions: fileData.additions,
      deletions: fileData.deletions,
      filename: fileData.filename.split("/").pop(),
    };
    files.push(fileObject);
  });

  const dataObject = {
    date: changeStats.data.commit.committer.date,
    stats: changeStats.data.stats,
    numFiles: changeStats.data.files.length,
    files: files,
  };
  return dataObject;
}

//post http://localhost:8080/api/github/impact
//to test out this endpoint, remeber to put the json object below in postman->body->raw->json type
//{
//   "owner":"kai2233",
//   "repo": "TicketWingMan_backend"
// }
//
// result of this endpoint will list out the commits that does merge pull request from branch to main
// include date, number of files affected, line of code been changed
// more details about files changes is iniside file object
router.post("/impact", async (req, res, next) => {
  const { owner, repo } = req.body;
  try {
    const filteredData = [];
    const dataCollection = [];
    // const result = await octokit.request('GET /repos/{owner}/{repo}/commits', {
    // 	owner: owner,
    // 	// repo: 'TicketWingMan_backend',
    // 	repo: repo,
    // 	per_page: 100,
    // });
    const result = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner: owner,
      repo: repo,
      per_page: 10,
      state: "closed",
    });
    // res.status(200).json(result.data);
    result.data.forEach(async (data) => {
      // if (data.commit.message.includes("Merge")) {
      // const result = await filter(data.parents[0].sha);
      // 	filteredData.push(impactFilter(owner, repo, data.sha))
      // }
      filteredData.push(impactFilter(owner, repo, data.merge_commit_sha));
    });
    Promise.all(filteredData)
      .then((stat) => {
        dataCollection.push(stat);
      })
      .then(() => {
        res.send(dataCollection);
      });
  } catch (err) {
    res
      .status(500)
      .json({ message: "get request for commit data failed exception" });
    next(err);
  }
});

function leadTimeObjFilter(dataObj) {
  let filteredObj = {};
  let commitdat = dataObj.commit;
  filteredObj.author = commitdat.author;
  filteredObj.commit_date = filteredObj.author.date.substring(
    0,
    filteredObj.author.date.indexOf("T")
  );
  filteredObj.message = commitdat.message;
  return filteredObj;
}

function leadTimeFilter(dataCollection) {
  let resData = [];
  dataCollection.map((element) => {
    let filteredEle = leadTimeObjFilter(element);

    if (resData.length == 0) {
      resData.push({ date: filteredEle.commit_date, data: [filteredEle] });
    } else {
      let res = resData.some((item) => {
        if (item.date == filteredEle.commit_date) {
          item.data.push(filteredEle);
          return true;
        }
      });

      if (!res) {
        resData.push({ date: filteredEle.commit_date, data: [filteredEle] });
      }
    }
  });

  let fianl = {
    statistic: {
      average_commit:
        Math.round((dataCollection.length / resData.length) * 100) / 100,
      total_commit: dataCollection.length,
    },
    commit_data: resData,
  };

  return fianl;
}

async function getAllCommits(req) {
  var data = [];
  var page = 1;

  while (true) {
    const result = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner: req.query.owner,
      repo: req.query.repo,
      per_page: 100,
      page: page,
    });

    if (result.data.length == 0) {
      break;
    }

    data = data.concat(result.data);
    page += 1;
  }
  return data;
}

/*
  end-point url -> http://localhost:8080/api/github/leadTime?owner=[owner]&repo=[repo]
	smaple usage -> http://localhost:8080/api/github/leadTime?owner=kai2233&repo=TicketWingMan_backend

  expected query data pass in:
	owner = [the name of the repo's owner]
	repo = [the name of the repo]

  expected return result object :
	{
	  statistic : {average_commit, total_commit},
	  commit_data : [{author: {name, email., date}, commit_date, message}, ... ]
	}
  
  description:
	result of this endpoint will list out the all commits of the repository, 
	including date, commit message, and author info of the commit. Also
	having the statistic data for the total number of commits and the 
	aveage commit times of eatch date.
*/
router.get("/leadTime", async (req, res, next) => {
  try {
    const result = await getAllCommits(req);
    let resultfiltered = leadTimeFilter(result);

    resultfiltered
      ? res.send(resultfiltered)
      : res.status(500).json({ message: "get request for pulls data failed" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "get request for pulls data failed exception" });
    next(err);
  }
});

// Unreviewed Pull Requests
async function getGitHubPulls(req) {
  // console.log(req.query);
  // const { owner, repo } = req.query;
  // the owner and repo is hardcoded for now, will change it later
  const { owner, repo } = { owner: "languagetool-org", repo: "languagetool" };
  async function getAllPulls(limit, page) {
    console.log(`page number: ${page}`);
    const data = [];
    // request api
    const result = await octokit.request(
      // get open pull requests only to avoid api call limit
      // "GET /repos/{owner}/{repo}/pulls?state=open",
      `GET /repos/{owner}/{repo}/pulls?state=open&per_page=${limit}&page=${page}`,
      {
        owner: owner,
        repo: repo,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    // return data and store it in declared data array
    if (Array.isArray(result.data)) {
      data.push(...result.data);
    }
    // if limit is smaller than length, then it is the last page
    if (result.data.length < limit) {
      return data;
    } else {
      // if not, then go to next page and retrieve data
      const preData = await getAllPulls(limit, page + 1);
      if (Array.isArray(preData)) {
        data.push(...preData);
      }
      return data;
    }
  }
  let pullData = await getAllPulls(100, 1);
  console.log("Successfully fetch pullData");
  // use Promise.all to execute all asynchronous functions
  const promises = Promise.all(
    pullData.map((t, i) =>
      getGitHubPullReview(owner, repo, t.number, i, pullData.length)
    )
  );
  // keep track of successfully reviewed and failed-to-review GitHub pull requests
  const result = {
    success: 0,
    failure: 0,
  };
  await promises.then((res) => {
    console.log("Successfully fetch reviewData");
    res.forEach((t, i) => {
      // if review.data's length is greater than 0, it means there is comment in that pull request
      // then it is not an unreviewed pull requests
      // therefore, the count of successfully reviewed pull requests increments
      if (Array.isArray(t.data) && t.data.length > 0) {
        result.success++;
      } else {
        // otherwise, the count of pull requests failed to be reviewed increments
        result.failure++;
      }
    });
  });
  return result;
}

async function getGitHubPullReview(owner, repo, pull_number, index, total) {
  return await octokit
    .request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      owner,
      repo,
      pull_number,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })
    .then((res) => {
      return res;
    });
}

router.get("/generatePull", async (req, res, next) => {
  try {
    const result = await getGitHubPulls(req);
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .json({ message: "get request for pulls data failed exception" });
    next(err);
  }
});

module.exports = router;
