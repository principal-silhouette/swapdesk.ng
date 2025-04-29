// Global variables
const API_KEY = 'AIzaSyCqNBQlnUIqfBK4Oz_SpsNETC8lYuPUpSQ';
const SPREADSHEET_ID = '1nM67nJrGNMuoHzbYKsSolhTl3W94UUCW0oVW14AuTWk';
const RANGE = 'g5:t250';
let data = [];
let deviceTypes = [];
let categories = [];
let selectedLocation = "";
let isPerfectCondition = true;
tradeInConfiguration = {
  deviceName: "",
  deviceType: "",
  deviceCategory: "",
  configuration: "",
  tradeInValue: 0,
  bodyConditionDeduction: 0,
  screenConditionDeduction: 0,
  batteryHealthDeduction: 0,
  networkBiometricsDeduction: 0
};

swapConfiguration = {
  deviceName: "",
  deviceType: "",
  deviceCategory: "",
  configuration: "",
  deviceQuality: "",
  currentRetailPrice: 0,
  swapRate: 0
};

let currentQuestionIndex = 0;
const conditionQuestions = [
  { question: "Does the device have any body defects?", deductionType: "bodyCondition", multiplier: 0.1 },
  { question: "Is the screen or True Tone damaged?", deductionType: "screenCondition", multiplier: 0.15 },
  { question: "Is the battery health below acceptable level?", deductionType: "batteryHealth", multiplier: 0.1 },
  { question: "Are there issues with network or biometrics?", deductionType: "networkBiometrics", multiplier: 0.05 },
  { question: "Does the earpiece or speaker have problems?", deductionType: "earpieceSpeaker", multiplier: 0.05 },
  { question: "Is the camera malfunctioning?", deductionType: "camera", multiplier: 0.1 },
  { question: "Does the charging port, mic, or speaker have issues?", deductionType: "chargingMicSpeaker", multiplier: 0.05 }
];

let swapData = {};


// Load data from Google Sheet
async function loadData() {
  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`);
    const json = await response.json();
    data = json.values.slice(1).filter(row => row[0]); // Filter out rows with empty categories

    console.log("Loaded data:", data); // Log the loaded data

    populateTradeInDeviceTypes("deviceTypeTradeIn");
    populateTradeInDeviceTypes("deviceTypeSwap");
    populateTradeInDeviceTypes("deviceTypePrices");
  } catch (error) {
    console.error("Error loading data:", error);
  }
}
function populateTradeInDeviceTypes(containerId) {
  // Clear the container before populating it
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const deviceTypes = [...new Set(data.map(row => row[0]))];

  deviceTypes.forEach(deviceType => {
    if (deviceType) {
      const button = document.createElement("button");
      button.dataset.deviceType = deviceType;
      button.textContent = deviceType;
      button.addEventListener("click", handleButtonClick);
      container.appendChild(button);
    }
  });
}
function handleDeviceTypeClick(event) {
  const deviceType = event.target.dataset.deviceType;
  console.log(`Device Type Selected: ${deviceType}`);

  const containerId = event.target.parentElement.nextElementSibling.id;
  tradeInConfiguration.deviceType = deviceType;

  populateCategoryButtons(deviceType, containerId);

  // Hide other device type buttons
  const deviceTypeButtons = event.target.parentElement.querySelectorAll("button");
  deviceTypeButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class

  // Update checkForSwapButton display depending on the scenario
  if (containerId === "deviceCategoryTradeIn") {
    document.getElementById("checkForSwapButton").style.display = "block";
  } else if (containerId === "deviceCategorySwap") {
    document.getElementById("continueButton").style.display = "none";
  }
}
function populateCategoryButtons(deviceType, containerId) {
  // Filter the data based on device type and eligibility
  console.log("Filtering data based on device type and eligibility");
  const filteredData = data.filter(row => row[0] === deviceType && row[3] === 'Yes');
  console.log("Filtered Data:", filteredData);

  // Get the unique categories from the filtered data
  console.log("Getting unique categories from filtered data");
  const categories = Array.from(new Set(filteredData.map(row => row[1])));
  console.log("Unique Categories:", categories);

  // Clear existing categories
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  categories.forEach(category => {
    const button = document.createElement('button');
    button.dataset.deviceCategory = category;
    button.textContent = category;
    button.addEventListener("click", handleCategoryClick);
    container.appendChild(button);
  });

  container.classList.remove("hidden");
}


function handleCategoryClick(event) {
  const deviceCategory = event.target.dataset.deviceCategory;
  console.log(`Device Category Selected: ${deviceCategory}`);

  tradeInConfiguration.deviceCategory = deviceCategory;

  // Hide other category buttons
  const categoryButtons = event.target.parentElement.querySelectorAll("button");
  categoryButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class

  const phase1Button = document.querySelector("#phase1 .selected-button");

  if (phase1Button.id === "swapButton") {
    continueToPhase3();
  } else if (phase1Button.id === "tradeInButton") {
    displayTradeInTable();
  } else if (phase1Button.id === "CheckPriceButton") {
    displayPricesTable();
  }
}

function displayTradeInTable() {
  console.log("Display Trade-In Table");

  if (tradeInConfiguration.deviceType && tradeInConfiguration.deviceCategory) {
    console.log(tradeInConfiguration.deviceType, tradeInConfiguration.deviceCategory);
    const tradeInData = data
      .filter(row => row[1] === tradeInConfiguration.deviceCategory && row[0] === tradeInConfiguration.deviceType && row[3] === "Yes")
      .map(row => ({ deviceName: row[4], condition: row[5], value: row[8] }));

    console.log(tradeInData);

    let tradeInTableContainer = document.getElementById('tradeInTableContainer');
    tradeInTableContainer.innerHTML = '';

    let table = document.createElement("table");
    table.setAttribute("id", "tradeInTable");
    table.className = 'dd-table';

    let header = table.createTHead();
    let headerRow = header.insertRow(0);

    let cell1 = headerRow.insertCell(0);
    let cell2 = headerRow.insertCell(1);
    cell1.innerHTML = "Your Device";
    cell2.innerHTML = "Estimated Trade-in Value";

    console.log("Table header created");

    let tbody = table.createTBody();

    tradeInData.reverse().forEach(item => {
      let row = tbody.insertRow();
      let cell1 = row.insertCell(0);
      let cell2 = row.insertCell(1);
      cell1.innerHTML = item.deviceName + ", " + item.condition;
      cell2.innerHTML = item.value;

      console.log("Table row created for condition:", item.condition);
      console.log(table);
    });

    tradeInTableContainer.appendChild(table);
    tradeInTableContainer.style.display = 'block';
  
    // Hide the GoBackButton and show the ResetTradeInTable button
    document.getElementById("ResetTradeInTable").style.display = "block";
    document.getElementById("checkForSwapButton").style.display = "block";

  } else {
    console.log("Device type or category not selected");
  }
}
function displayPricesTable() {
  console.log("Display Prices Table");

  if (tradeInConfiguration.deviceType && tradeInConfiguration.deviceCategory) {
    console.log(tradeInConfiguration.deviceType, tradeInConfiguration.deviceCategory);
    const tradeInData = data
      .filter(row => row[1] === tradeInConfiguration.deviceCategory && row[0] === tradeInConfiguration.deviceType)
      .map(row => ({ deviceName: row[4], condition: row[5], quality: row[2], value: row[6] })); // Include quality

    console.log(tradeInData);

    let pricesTableContainer = document.getElementById('pricesTableContainer');
    pricesTableContainer.innerHTML = '';

    let table = document.createElement("table");
    table.setAttribute("id", "pricesTable");
    table.className = 'dp-table';

    let header = table.createTHead();
    let headerRow = header.insertRow(0);

    let cell1 = headerRow.insertCell(0);
    let cell2 = headerRow.insertCell(1);
    cell1.innerHTML = "Device";
    cell2.innerHTML = "Retail Price";

    console.log("Table header created");

    let tbody = table.createTBody();

    tradeInData.forEach(item => {
      let row = tbody.insertRow();
      let cell1 = row.insertCell(0);
      let cell2 = row.insertCell(1);

      const deviceName = document.createElement("div");
      deviceName.textContent = item.deviceName + ", " + item.condition; // Include condition
      cell1.appendChild(deviceName);

      const deviceQuality = document.createElement("div");
      deviceQuality.style.fontSize = "0.6em"; // Make quality text even smaller
      deviceQuality.style.paddingTop = "0px"; // Reduce gap
      deviceQuality.style.color = "grey";
      deviceQuality.textContent = item.quality; // Display quality
      cell1.appendChild(deviceQuality);

      cell2.innerHTML = item.value;

      console.log("Table row created for quality:", item.quality);
      console.log(table);
    });

    pricesTableContainer.appendChild(table);
    pricesTableContainer.style.display = 'block';
  
    // Show the ResetPricesInTable button, keep the GoBackButton visible
    document.getElementById("ResetPricesInTable").style.display = "block";
  
  } else {
    console.log("Device type or category not selected");
  }
}
function clearAndCheckAnotherDevice() {
  // Hide the tables
  document.getElementById("tradeInTableContainer").style.display = "none";
  document.getElementById("pricesTableContainer").style.display = "none";

  // Hide the ResetTradeInTable and ResetPricesInTable buttons
  document.getElementById("ResetTradeInTable").style.display = "none";
  document.getElementById("ResetPricesInTable").style.display = "none";

  // Show all device type buttons and remove the selected-button class
  const deviceTypeButtons = document.querySelectorAll("#deviceTypeTradeIn button, #deviceTypePrices button");
  deviceTypeButtons.forEach(button => {
    button.classList.remove("hidden");
    button.classList.remove("selected-button");
  });

  // Hide the device category buttons
  const deviceCategoryButtons = document.querySelectorAll("#deviceCategoryTradeIn button, #deviceCategoryPrices button");
  deviceCategoryButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  // Hide the device category containers
  document.getElementById("deviceCategoryTradeIn").classList.add("hidden");
  document.getElementById("deviceCategoryPrices").classList.add("hidden");

  // Reset the tradeInConfiguration and swapConfiguration objects
  tradeInConfiguration = {
    deviceName: "",
    deviceType: "",
    deviceCategory: "",
    configuration: "",
    tradeInValue: 0,
    bodyConditionDeduction: 0,
    screenConditionDeduction: 0,
    batteryHealthDeduction: 0,
    networkBiometricsDeduction: 0
  };

  swapConfiguration = {
    deviceName: "",
    deviceType: "",
    deviceCategory: "",
    configuration: "",
    deviceQuality: "",
    swapRate: 0
  };
}

function populateDeviceNames(deviceCategory) {
  console.log(`Populating device names for category: ${deviceCategory}`);
  // Populate device names based on the selected category and eligibility
  const deviceNameContainer = document.getElementById("deviceNameContainer");
  deviceNameContainer.innerHTML = "";

  const deviceNames = data
    .filter((device) => device[1] === deviceCategory && device[3] === 'Yes')
    .map((device) => device[4]);

  // Remove duplicates
  const uniqueDeviceNames = [...new Set(deviceNames)];

  console.log(`Unique device names: ${JSON.stringify(uniqueDeviceNames)}`);

  uniqueDeviceNames.forEach((deviceName) => {
    const button = document.createElement("button");
    button.dataset.deviceName = deviceName;
    button.textContent = deviceName;
    button.addEventListener("click", handleDeviceNameClick);
    deviceNameContainer.appendChild(button);
    console.log(`Appended button for device name: ${deviceName}`);
  });
}

function handleDeviceNameClick(event) {
  const deviceName = event.target.dataset.deviceName;
  console.log(`Device Name Selected: ${deviceName}`);

  tradeInConfiguration.deviceName = deviceName;

  // Get the unique configurations based on the selected device name and eligibility
  const configurations = Array.from(
    new Set(data.filter(row => row[4] === deviceName && row[3] === 'Yes').map(row => row[5]))
  );

  console.log(`Configurations: ${JSON.stringify(configurations)}`);

  // Clear existing configurations
  deviceConfigurationContainer.innerHTML = "";

  // Create and append configuration buttons
  configurations.forEach(configuration => {
    const button = document.createElement("button");
    button.dataset.deviceConfiguration = configuration;
    button.textContent = configuration;
    button.addEventListener("click", handleConfigurationClick);
    deviceConfigurationContainer.appendChild(button);
  });

  // Hide other device name buttons
  const deviceNameButtons = event.target.parentElement.querySelectorAll("button");
  deviceNameButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class

  deviceConfigurationContainer.classList.remove("hidden");
}

function handleConfigurationClick(event) {
  const deviceConfiguration = event.target.dataset.deviceConfiguration;
  console.log(`Device Configuration Selected: ${deviceConfiguration}`);

  tradeInConfiguration.configuration = deviceConfiguration;

  // Show loading animation with trade-in loading text
  const subHeaderText = "Please be patient while we verify your Trade In Value 🔄💰";
  const tradeInLoadingText = [
    "🔍 Analyzing Device Information...",
    "📈 Checking Market Trends...",
    "📱 Comparing Device Models...",
    "✅ Validating Device Condition...",
    "💰 Calculating Trade-In Value...",
    "🔒 Finalizing Trade-In Value...",
  ];
  showLoadingAnimation(subHeaderText, tradeInLoadingText);
  setTimeout(() => {
    hideLoadingAnimation();
    displayTradeInOutput(tradeInConfiguration.deviceName, tradeInConfiguration.configuration);
  }, 5000);

  // Hide other configuration buttons
  const configurationButtons = event.target.parentElement.querySelectorAll("button");
  configurationButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class

  // Show the "Continue" button
  document.getElementById("continueButton").style.display = "block";
}
function displayTradeInOutput(deviceName, deviceConfiguration) {
  // Get the trade-in value based on the selected device name and configuration
  const tradeInValueRow = data.find(
    (row) => row[4] === tradeInConfiguration.deviceName && row[5] === tradeInConfiguration.configuration
  );

  const value = tradeInValueRow ? tradeInValueRow[8] : "Not Found";
  console.log(`Trade-in value: ${value}`);

  // Save the trade-in value to the global variable (removing currency sign and comma)
  tradeInConfiguration.tradeInValue = parseInt(value.replace(/[^0-9]/g, ''));

  const formattedTradeInValue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "code",
    currencySign: "accounting",
    minimumFractionDigits: 0,
  }).format(tradeInConfiguration.tradeInValue).replace("NGN", "₦");

  const tradeInOutputDiv = document.getElementById("tradeInOutput");
  tradeInOutputDiv.innerHTML = `
    <h4 class="htradein">Congratulations!🥳🎉</h4>
    <p class="par5output">You can Get Up to <strong>${value}</strong> when you Trade In📲 your <strong>${deviceConfiguration}, ${deviceName}</strong>. You can either Trade In  for <strong>Cash</strong> 💵 or <strong>Swap</strong> 🔄 to another Device.</p>
    <p class="par4">Remember that this <strong>Value</strong> only applies if your <strong>${deviceName}</strong> is in <strong>Perfect Condition</strong>✨. If there are any issues, you can inform our Sales Team 👩‍💼👨‍💼 after you've gotten an Estimate for the Swap.</p>
  `;
  tradeInOutputDiv.style.display = "block";

  // Show the "Select a Device to Swap" button
  const continueToPhase4Button = document.getElementById("continueToPhase4Button");
  continueToPhase4Button.style.display = "block";
}
function populateSwapDeviceTypes(containerId) {
  // Clear the container before populating it
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const deviceTypes = [...new Set(data.map(row => row[0]))];

  deviceTypes.forEach(deviceType => {
    if (deviceType) {
      const button = document.createElement("button");
      button.dataset.deviceType = deviceType;
      button.textContent = deviceType;
      button.addEventListener("click", handleSwapDeviceTypeClick);
      container.appendChild(button);
    }
  });
}

function handleSwapDeviceTypeClick(event) {
  console.log("handleSwapDeviceTypeClick");
  const targetType = event.target.getAttribute("data-device-type");
  if (!targetType) return;

  swapConfiguration.deviceType = targetType;

 // Get the unique categories based on the selected device type, excluding "Samsung"
 const categories = Array.from(new Set(data.filter(row => row[0] === targetType && row[1] !== "Samsung").map(row => row[1])));

  const swapDeviceCategory = document.getElementById("swapDeviceCategory");
  swapDeviceCategory.innerHTML = "";

  // Create and append category buttons
  categories.forEach(category => {
    const button = document.createElement('button');
    button.dataset.deviceCategory = category;
    button.textContent = category;
    button.addEventListener("click", handleSwapCategoryClick);
    swapDeviceCategory.appendChild(button);
  });

  swapDeviceCategory.classList.remove("hidden");

  // Hide other device type buttons
  const deviceTypeButtons = event.target.parentElement.querySelectorAll("button");
  deviceTypeButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  // Keep the selected button visible and add the selected-button class
  event.target.classList.remove("hidden");
  event.target.classList.add("selected-button");
}

function handleSwapCategoryClick(event) {
  console.log("handleSwapCategoryClick");
  const deviceCategory = event.target.dataset.deviceCategory;

  if (!deviceCategory) return;

  swapConfiguration.deviceCategory = deviceCategory;

  // Hide other category buttons
  const categoryButtons = event.target.parentElement.querySelectorAll("[data-device-category]");
  categoryButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class

  // Show the continue button
  continueToPhase5()
}
function populateSwapDeviceNames() {
  console.log(`Populating swap device names for category: ${swapConfiguration.deviceCategory}`);
  const swapDeviceNameContainer = document.getElementById("swapDeviceNameContainer");
  swapDeviceNameContainer.innerHTML = "";

  const deviceData = data.filter(
    (device) => device[0] === swapConfiguration.deviceType && device[1] === swapConfiguration.deviceCategory
  );

  const uniqueDeviceData = [...new Map(deviceData.map(item => [`${item[4]}_${item[2]}`, item])).values()];

  console.log(`Unique swap device data: ${JSON.stringify(uniqueDeviceData)}`);

  uniqueDeviceData.forEach((device) => {
    const button = document.createElement("button");
    button.dataset.deviceName = device[4];

    const deviceName = document.createElement("div");
    deviceName.textContent = device[4];
    button.appendChild(deviceName);

    const deviceQuality = document.createElement("div");
    deviceQuality.style.fontSize = "smaller";
    deviceQuality.style.paddingTop = "5px";
    deviceQuality.style.color = "grey";
    deviceQuality.textContent = device[2];
    button.appendChild(deviceQuality);

    swapDeviceNameContainer.appendChild(button);
    console.log(`Appended button for device name: ${device[4]}`);
  });

  // attach event listener to container element
  swapDeviceNameContainer.addEventListener("click", handleSwapDeviceNameClick);
}

function handleSwapDeviceNameClick(event) {
  const button = event.target.closest("button");
  if (button) {
    const swapDeviceName = button.dataset.deviceName;
    const swapDeviceQuality = button.querySelector("div:nth-child(2)").textContent; // Extract the quality text
    console.log(`Device Name Selected: ${swapDeviceName}, Device Quality: ${swapDeviceQuality}`);

    // Update swap configuration with the selected device name and quality
    swapConfiguration.deviceName = swapDeviceName;
    swapConfiguration.deviceQuality = swapDeviceQuality;

    // Filter configurations based on both device name and quality
    const configurations = Array.from(
      new Set(data.filter(row => row[4] === swapDeviceName && row[2] === swapDeviceQuality).map(row => row[5]))
    );

    console.log(`Configurations: ${JSON.stringify(configurations)}`);

    swapDeviceConfigurationContainer.innerHTML = "";

    configurations.forEach(configuration => {
      const price = data.find(row => row[4] === swapDeviceName && row[5] === configuration && row[2] === swapDeviceQuality)[6];

      const button = document.createElement("button");
      button.dataset.swapDeviceConfiguration = configuration;

      const configElement = document.createElement("div");
      configElement.textContent = configuration;
      button.appendChild(configElement);

      const retailPrice = document.createElement("div");
      retailPrice.style.fontSize = "smaller";
      retailPrice.style.paddingTop = "5px";
      retailPrice.style.color = "grey";
      retailPrice.textContent = `${price}`; // Display the retail price
      button.appendChild(retailPrice);

      button.addEventListener("click", handleSwapConfigurationClick);
      swapDeviceConfigurationContainer.appendChild(button);
    });

    const swapDeviceNameButtons = event.currentTarget.querySelectorAll("button");
    swapDeviceNameButtons.forEach(div => {
      div.classList.add("hidden");
      div.classList.remove("selected-swap");
    });

    button.classList.remove("hidden");
    button.classList.add("selected-button");

    swapDeviceConfigurationContainer.classList.remove("hidden");
  }
}

function handleSwapConfigurationClick(event) {
  if (event.target.tagName.toLowerCase() === "button" || event.target.tagName.toLowerCase() === "div") {
    const swapDeviceConfiguration = event.target.closest("button").dataset.swapDeviceConfiguration;
    swapConfiguration.configuration = swapDeviceConfiguration; // Set the global variable

    swapConfiguration.deviceName = document.getElementById("swapDeviceNameContainer")
      .querySelector(".selected-button")
      .dataset.deviceName;

    // Save the retail price of the selected configuration to the global variable
    const retailPrice = event.target.closest("button").querySelector("div:last-child").textContent;
    swapConfiguration.retailPrice = parseFloat(retailPrice.replace(/[^0-9.-]+/g, "")); // Remove non-numeric characters and convert to float

    // Show loading animation with swap loading text
    const subHeaderText = "Please Be Patient While We Calculate the Swap Rate 🔄💰";
    const swapLoadingText = [
      "🔍 Analyzing Device Information...",
      "💸 Calculating Swap Value...",
      "🔄 Evaluating Swap Options...",
      "📱 Comparing Device Models...",
      "🔗 Verifying Device Compatibility...",
      "🔒 Finalizing Swap Rate...",
    ];
    showLoadingAnimationSwap(subHeaderText, swapLoadingText);
    setTimeout(() => {
      hideLoadingAnimation();
      displaySwapRateOutput();
    }, 6000);

    // Hide other configuration buttons
    const swapConfigurationButtons = event.target.parentElement.querySelectorAll("button");
    swapConfigurationButtons.forEach(button => {
      button.classList.add("hidden");
      button.classList.remove("selected-button");
    });

    event.target.closest("button").classList.remove("hidden"); // Keep the selected button visible
    event.target.closest("button").classList.add("selected-button"); // Add the selected-swap class

    // Show the "Continue" button
    document.getElementById("continueToPhase6Button").style.display = "block";
  }
}

function displaySwapRateOutput() {
  console.log("displaySwapRateOutput called");

  const oldDevice = tradeInConfiguration.deviceName;
  const oldConfig = tradeInConfiguration.configuration;
  const newDevice = swapConfiguration.deviceName;
  const newConfig = swapConfiguration.configuration;
  const selectedQuality = swapConfiguration.deviceQuality;

  swapConfiguration.swapRate = calculateSwapRate(oldDevice, oldConfig, newDevice, newConfig, selectedQuality);
  console.log("Calculated Swap Rate:", swapConfiguration.swapRate);

  swapConfiguration.swapRate = Math.floor(swapConfiguration.swapRate / 1000) * 1000;

  // Ensure we retrieve the correct price using both configuration and quality
  console.log("Looking for:", newDevice, newConfig, selectedQuality);
  const deviceData = data.find(
    (row) => row[4] === newDevice && row[5] === newConfig && row[2] === selectedQuality
  );

  if (deviceData) {
    console.log("Device Data Found:", deviceData);

    const formattedSwapRate = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "NGN",
      currencyDisplay: "code",
      currencySign: "accounting",
      minimumFractionDigits: 0,
    }).format(swapConfiguration.swapRate).replace("NGN", "₦");

    const swapRateOutputDiv = document.getElementById("swapRateOutput");
    swapRateOutputDiv.classList.remove("hidden");

    if (swapConfiguration.swapRate > 0) {
      swapRateOutputDiv.innerHTML = `
        <h4 class="htradein">…and we’re done!💃🏻💪🏾</h4>
        <p class="par5output">We can confirm that for <strong>${formattedSwapRate}</strong> we can <strong>Upgrade</strong> your Nigerian Used <strong>${oldDevice} ${oldConfig}</strong> to a <strong>${selectedQuality}</strong> <strong>${newConfig} ${newDevice}</strong> 🥳</p>
        <p class="par4">Once again, we’d like to remind you that the Swap Rate only applies if your <strong>${oldDevice}</strong> is in Perfect Condition✨. If there are any issues we need to know about, Please inform our Sales Team👩‍💼👨‍💼 at the end of this Process.</p>
      `;
    } else {
      swapRateOutputDiv.innerHTML = `
        <h4 class="htradein">…and we’re done!💃🏻💪🏾</h4>
        <p class="par5output">If you choose to <strong>Downgrade</strong> from your Nigerian Used <strong>${oldDevice} ${oldConfig}</strong> to a <strong>${selectedQuality}</strong> <strong>${newConfig} ${newDevice}</strong>, you’d be getting about <strong>${formattedSwapRate}</strong> as CashBack! 🤩</p>
        <p class="par4">Once again, we’d like to remind you that the Swap Rate only applies if your <strong>${oldDevice}</strong> is in Perfect Condition✨. If there are any issues we need to know about, Please inform our Sales Team👩‍💼👨‍💼 at the end of this Process.</p>
      `;
    }
  } else {
    console.error("Device data not found for the selected configuration and quality.");
  }
}

function calculateSwapRate() {
  console.log("calculateSwapRate called");
  // Use global variables instead of passed parameters
  const newDevice = swapConfiguration.deviceName;
  const newConfig = swapConfiguration.configuration;

  console.log(`New Device: ${newDevice}`); // Log newDevice
  console.log(`New Config: ${newConfig}`); // Log newConfig

  // Find the current retail price for the new device and configuration
  const newDeviceData = data.find(row => row[4] === newDevice && row[5] === newConfig);
  console.log(`New Device Data: ${JSON.stringify(newDeviceData)}`); // Log newDeviceData

  const currentRetailPrice = newDeviceData ? Number(newDeviceData[6].replace(/[₦,]/g, '')) : 0;
  console.log(`Current Retail Price: ${currentRetailPrice}`); // Log currentRetailPrice

  swapConfiguration.currentRetailPrice = currentRetailPrice

  console.log(`Trade-In Value: ${tradeInConfiguration.tradeInValue}`); // Log tradeInConfiguration.tradeInValue

  // Calculate the swap rate
  swapConfiguration.swapRate = currentRetailPrice - tradeInConfiguration.tradeInValue;
  console.log(`Swap Rate: ${swapConfiguration.swapRate}`); // Log swapConfiguration.swapRate
  return swapConfiguration.swapRate;
}
function showStep(stepNumber) {
  const steps = document.querySelectorAll('.step');
  steps.forEach((step, index) => {
    if (index === stepNumber - 1) {
      step.style.display = 'block';
    } else {
      step.style.display = 'none';
    }
  });
}


// Handle condition selection
function onConditionSelected(condition, event) {
  isPerfectCondition = condition === "Yes";
  
  if (condition === "No") {
    // Display condition questions
    document.getElementById('conditionQuestions').style.display = 'block';
    // Hide phase 6 transition button
    document.getElementById('goToPhase7Button').style.display = 'none';
    showNextConditionQuestion();
  } else {
    // Hide condition questions
    document.getElementById('conditionQuestions').style.display = 'none';
    // Show phase 6 transition button for perfect condition
    document.getElementById('goToPhase7Button').style.display = 'inline-block';
  }
  
  // Hide condition selection buttons
  const conditionButtons = event.target.parentElement.querySelectorAll("button");
  conditionButtons.forEach(button => {
    button.classList.add("hidden");
  });

  // Highlight selected button
  event.target.classList.remove("hidden");
  event.target.classList.add("selected-button");
}

// Show next condition question
function showNextConditionQuestion() {
  const questionContainer = document.getElementById('questionSteps');
  
  // Clear previous question
  questionContainer.innerHTML = '';
  
  if (currentQuestionIndex < conditionQuestions.length) {
    const currentQuestion = conditionQuestions[currentQuestionIndex];
    
    // Create question element
    const questionElement = document.createElement('div');
    questionElement.innerHTML = `
      <p>${currentQuestion.question}</p>
      <button onclick="handleConditionResponse('Yes', '${currentQuestion.deductionType}', ${currentQuestion.multiplier})">Yes</button>
      <button onclick="handleConditionResponse('No', '${currentQuestion.deductionType}', ${currentQuestion.multiplier})">No</button>
    `;
    
    // Append question element to the container
    questionContainer.appendChild(questionElement);
  } else {
    // All questions are done, show proceed button
    document.getElementById('goToPhase7Button').style.display = 'inline-block';
  }
}

// Handle user response to each question
function handleConditionResponse(response, deductionType, deductionMultiplier) {
  if (response === 'Yes') {
    applyDeduction(deductionType, deductionMultiplier);
  }
  
  // Move to the next question
  currentQuestionIndex++;
  showNextConditionQuestion();
}

// Update trade-in value
function applyDeduction(deductionType, deductionMultiplier) {
  const deductionAmount = tradeInConfiguration.tradeInValue * deductionMultiplier;
  tradeInConfiguration.tradeInValue -= deductionAmount;

  // Track the applied deduction
  tradeInConfiguration[`${deductionType}Deduction`] = deductionAmount;
  
  updateTradeInValue();
}

function showConditionQuestions() {
  const questionsContainer = document.getElementById('conditionQuestions');
  questionsContainer.innerHTML = ""; // Clear previous questions

  const issues = [
    { name: "Battery Health", deductionType: "batteryHealth", question: "Is your battery health below 80%?" },
    { name: "Body Defects", deductionType: "bodyCondition", question: "Does your device have visible dents or scratches?" },
    { name: "Screen & True Tone", deductionType: "screenCondition", question: "Is the screen cracked, or is True Tone malfunctioning?" },
    { name: "Network & Biometrics", deductionType: "networkBiometrics", question: "Is the device network locked or biometrics not working?" },
    { name: "Earpiece & Speaker", deductionType: "earpieceSpeaker", question: "Is there an issue with the earpiece or speaker?" },
    { name: "Camera", deductionType: "camera", question: "Are there problems with the camera?" },
    { name: "Charging, Mic & Speaker", deductionType: "chargingMicSpeaker", question: "Is the microphone or charging port faulty?" }
  ];

  issues.forEach(issue => {
    const questionElement = createQuestionElement(issue);
    questionsContainer.appendChild(questionElement);
  });

  questionsContainer.style.display = 'block'; // Show questions container
}

function createQuestionElement(issue) {
  const questionDiv = document.createElement('div');
  questionDiv.classList.add('question');

  const label = document.createElement('label');
  label.textContent = issue.question;

  const yesButton = createOptionButton('Yes', issue.deductionType, 1);
  const noButton = createOptionButton('No', issue.deductionType, 0);
  const bothButton = createOptionButton('Both', issue.deductionType, 2); // Both = apply deduction twice

  questionDiv.appendChild(label);
  questionDiv.appendChild(yesButton);
  questionDiv.appendChild(noButton);
  questionDiv.appendChild(bothButton);

  return questionDiv;
}

function createOptionButton(label, deductionType, multiplier) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = () => handleConditionResponse(deductionType, multiplier);
  return button;
}

function handleConditionResponse(deductionType, multiplier) {
  if (multiplier > 0) {
    const deductionMultiplier = (multiplier === 2) ? 2 : 1; // Apply deduction twice if "Both" is selected
    applyDeduction(deductionType, deductionMultiplier);
  }
  updateTradeInValue();
}

function showGoToPhase7Button() {
  const goToPhase7Button = document.getElementById('goToPhase7Button');
  goToPhase7Button.style.display = 'inline-block';
}

function applyDeduction(deductionType, deductionMultiplier) {
  const deductionAmount = tradeInConfiguration.tradeInValue * deductionMultiplier;
  tradeInConfiguration.tradeInValue -= deductionAmount;

  // Update the tradeInConfiguration object with the applied deduction
  if (deductionType === "bodyCondition") {
    tradeInConfiguration.bodyConditionDeduction = deductionAmount;
  } else if (deductionType === "screenCondition") {
    tradeInConfiguration.screenConditionDeduction = deductionAmount;
  } else if (deductionType === "batteryHealth") {
    tradeInConfiguration.batteryHealthDeduction = deductionAmount;
  } else if (deductionType === "networkBiometrics") {
    tradeInConfiguration.networkBiometricsDeduction = deductionAmount;
  }

  // Update the trade-in value
  updateTradeInValue();
}
function updateTradeInValue() {
  const totalDeductions =
    tradeInConfiguration.bodyConditionDeduction +
    tradeInConfiguration.screenConditionDeduction +
    tradeInConfiguration.batteryHealthDeduction +
    tradeInConfiguration.networkBiometricsDeduction;

  const finalTradeInValue = tradeInConfiguration.tradeInValue - totalDeductions;
  document.getElementById('tradeInValue').innerText = finalTradeInValue.toFixed(2);
}
function handleButtonClick(stepNumber, deductionType, deductionMultiplier, nextStep) {
  if (deductionType) {
    applyDeduction(deductionType, deductionMultiplier);
  }

  if (nextStep === 'noSwap') {
    goToNoSwap();
  } else if (nextStep === 'completeSwap') {
    completeSwap();
  } else if (nextStep === 'phase7') {
    goToPhase7();
  } else {
    showStep(stepNumber + 1);
  }
}
function completeSwap() {
  // Store the necessary data in the swapData object
  swapData.device = tradeInConfiguration.deviceName;
  swapData.configuration = tradeInConfiguration.configuration;
  swapData.swapDevice = swapConfiguration.deviceName;
  swapData.swapConfiguration = swapConfiguration.configuration;
  swapData.swapRate = swapConfiguration.swapRate;
  swapData.tradeInValue = tradeInConfiguration.tradeInValue;
  swapData.bodyConditionDeduction = tradeInConfiguration.bodyConditionDeduction;
  swapData.screenConditionDeduction = tradeInConfiguration.screenConditionDeduction;
  swapData.batteryHealthDeduction = tradeInConfiguration.batteryHealthDeduction;
  swapData.networkBiometricsDeduction = tradeInConfiguration.networkBiometricsDeduction;

  // Proceed to Phase 7
  goToPhase7();
}
function selectLocation(location) {
  // If the location parameter is an empty string, it means we're resetting the location data
  if (location === "") {
    // Clear any stored location data, e.g., by setting a global variable to an empty string or null
    // ...
    return; // Exit the function, since we don't want to display the WhatsApp message in this case
  }

  // Handle the user's location selection
  displayWhatsAppMessage(location);
}
function displayWhatsAppMessage() {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  const conditionMessage = isPerfectCondition
    ? ""
    : "and My device also has some issues you'd need to Review.";

  const message = `
    I'd like to Swap my *${tradeInConfiguration.deviceName}, ${tradeInConfiguration.configuration}* for *${swapConfiguration.deviceName}, ${swapConfiguration.configuration}.* \n\nI've confirmed that my *Trade In Value* is ${formatCurrency(tradeInConfiguration.tradeInValue)} and the *Swap Rate* is ${formatCurrency(swapConfiguration.swapRate)}. \n\nI'm currently in ${selectedLocation}.${conditionMessage}
  `;
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/+2347037853959?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
}
function viewSwapBreakdown() {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0
    }).format(amount).replace("NGN", "₦");
  };  

  const formatDeduction = (amount) => {
    return amount === 0 ? "None" : formatCurrency(amount);
  };

  const swapBreakdown = `
  <h4 class="htradein">Trade In 📱</h4>
  <p class="par505">${tradeInConfiguration.deviceName}, ${tradeInConfiguration.configuration}, <strong>${formatCurrency(tradeInConfiguration.tradeInValue)}</strong></p>
  <p class="par44">🇳🇬 Nigerian USED</p>
  
  <h4 class="htradein">${swapConfiguration.swapRate > 0 ? "Upgrade" : "Downgrade"} 🔄</h4>
  <p class="par505">${swapConfiguration.deviceName}, ${swapConfiguration.configuration}, <strong>${formatCurrency(swapConfiguration.currentRetailPrice)}</strong> </p>
  <p class="par44">${swapConfiguration.deviceQuality}</p>
  <p class="par505"><strong>Swap Rate:</strong> <strong>${formatCurrency(swapConfiguration.swapRate)}</strong> 💸</p>

    <h4 class="htradein">Deductions 😞</h4>
  <p class="par505"><strong>Spots, Scratches & Dents:</strong> ${formatDeduction(tradeInConfiguration.bodyConditionDeduction)}</p>
  <p class="par505"><strong>Display & Touchscreen:</strong> ${formatDeduction(tradeInConfiguration.screenConditionDeduction)}</p>
  <p class="par505"><strong>Battery Health:</strong> ${formatDeduction(tradeInConfiguration.batteryHealthDeduction)}</p>
  <p class="par505"><strong>Network & Biometrics:</strong> ${formatDeduction(tradeInConfiguration.networkBiometricsDeduction)}</p>
`;

    // Display the swap breakdown in a suitable element
    const swapBreakdownDiv = document.getElementById("swapBreakdown");
    swapBreakdownDiv.innerHTML = swapBreakdown;
    swapBreakdownDiv.style.display = "block";
    
    // Hide the "View Swap Breakdown" button
    const viewSwapBreakdownButton = document.getElementById("viewSwapBreakdownButton");
    if (viewSwapBreakdownButton) {
      viewSwapBreakdownButton.style.display = "none";
    }

    document.getElementById("downloadJpeg").classList.remove("hidden");
}


function onLocationButtonClick(location, event) {
  selectedLocation = location; // Store the location in the global variable

  // Find the closest button element
  const buttonElement = event.target.closest("button");

  // Update the selected button class and hide the other buttons
  const buttons = document.querySelectorAll('#locationButtonsContainer button');
  buttons.forEach((button) => {
      button.classList.remove('selected');
      button.style.display = 'none';
  });
  buttonElement.classList.add('selected-button');
  buttonElement.style.display = 'block';

  const locationInstructions = document.createElement("div");
  locationInstructions.id = "locationInstructions";

  // Display location-specific instructions
  let instructions = "";
  switch (location) {
    case "Port Harcourt":
      instructions = "📍If you're in Port Harcourt\nYou can Complete your Swap 🔄 in Person at our all new Experience Lounge at Garrison, Port Harcourt.";
      break;
    case "Uyo":
    case "Yenagoa":
      instructions = `📍If you're in ${location}\nFirst, Place a Swap Order with our Team WhatsApp. Your new iPhone 📲 would be delivered 🚚 to our Partner Service Center in your City within 48 Hours to enable you Complete your Swap 🔄`;
      break;
    case 'Abuja':
    case 'Lagos':
      instructions = 'You can complete your Swap at any of our Partner Service Centers in Abuja (Banex Plaza) 🇳🇬 and Lagos (Computer Village) 🌆. Our Swap Desk Team would connect you to our Local Swap Center and walk you through the process. 🚶‍♂️';
      break;
    case "Other Cities":
      instructions = "📍\nIf you’re not in any of these Cities, you can also waybill 🚚 your Device to us in Port Harcourt.";
      break;
  }

  const instructionsDiv = document.createElement("p");
  instructionsDiv.className = "par7"; // Add the par7 class to the instructions div
  instructionsDiv.textContent = instructions;
  locationInstructions.appendChild(instructionsDiv);

  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "buttons-container";

  buttonsContainer.innerHTML = `
      <button class="selection-button-whatsapp" id="whatsAppMessageButton" onclick="displayWhatsAppMessage()">Complete on WhatsApp</button>
      <button class="selection-button" id="viewSwapBreakdownButton" onclick="viewSwapBreakdown()">View Swap Breakdown</button>
      <button class="selection-button-down" id="startOverButton" onclick="startOver()">Start Over</button>
  `;

  locationInstructions.appendChild(buttonsContainer);

  // Append the new div to the phase7 div
  document.getElementById("phase7").appendChild(locationInstructions);
}

async function downloadSwapBreakdownImage() {
  console.log('downloadSwapBreakdownImage called');

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "NGN",
      currencyDisplay: "code",
      currencySign: "accounting",
      minimumFractionDigits: 0,
    }).format(value).replace("NGN", "₦");
  };

  const formatDeduction = (value) => {
    return value === 0 ? "None" : formatCurrency(value);
  };

  // Adjusted swapBreakdownHtml for the 1080x1920 resolution
  const swapBreakdownHtml = `
    <div style="position: relative; font-family: Arial, sans-serif; background-image: url('./images/swap-breakdown.jpg'); background-size: 1080px 1920px; background-repeat: no-repeat; width: 1080px; height: 1920px; padding: 20px;">
      <div style="position: absolute; top: 40%; left: 0; right: 0; bottom: 40%; display: flex; flex-direction: column; align-items: center; text-align: center;">
        <h4 class="htradein" style="margin-bottom: 10px;">Trade In Device 📱</h4>
        <p class="par505">${tradeInConfiguration.deviceName}, ${tradeInConfiguration.configuration}, <strong>${formatCurrency(tradeInConfiguration.tradeInValue)}</strong> 💰</p>
        <p class="par44">🇳🇬 Nigerian USED</p>
        <p class="par505">Location: ${selectedLocation}</p>
        
        <h4 class="htradein" style="margin-top: 20px;">${swapConfiguration.swapRate > 0 ? "Upgrade" : "Downgrade"} Device 🔄</h4>
        <p class="par505">${swapConfiguration.deviceName}, ${swapConfiguration.configuration}, <strong>${formatCurrency(swapConfiguration.currentRetailPrice)}</strong></p>
        <p class="par44">${swapConfiguration.deviceQuality}</p>
        <p class="par505"><strong>Swap Rate:</strong> <strong>${formatCurrency(swapConfiguration.swapRate)}</strong> 💸</p>
        
        <h4 class="htradein" style="margin-top: 20px;">Issues & Deductions</h4>
        <p class="par505"><strong>Spots, Scratches & Dents:</strong> ${formatDeduction(tradeInConfiguration.bodyConditionDeduction)}</p>
        <p class="par505"><strong>Display & Touchscreen:</strong> ${formatDeduction(tradeInConfiguration.screenConditionDeduction)}</p>
        <p class="par505"><strong>Battery Health:</strong> ${formatDeduction(tradeInConfiguration.batteryHealthDeduction)}</p>
        <p class="par505"><strong>Network & Biometrics:</strong> ${formatDeduction(tradeInConfiguration.networkBiometricsDeduction)}</p>
      </div>
    </div>
  `;

  console.log('swapBreakdownHtml:', swapBreakdownHtml);

  const img = new Image();

  const node = document.createElement('div');
  node.innerHTML = swapBreakdownHtml;
  document.body.appendChild(node);

  try {
    const dataUrl = await domtoimage.toJpeg(node, { quality: 1 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = '@the.swapdesk.jpeg';
    link.click();
  } catch (error) {
    console.error('Error generating image:', error);
  } finally {
    document.body.removeChild(node);
  }
}

function goToPricesPhase() {
   console.log("goToPricesPhase");
  
  // Hide phase 1
  const phase1Div = document.getElementById('phase1');
  phase1Div.style.display = 'none';

  // Show prices phase
  const pricesPhaseDiv = document.getElementById('pricesPhase');
  pricesPhaseDiv.style.display = 'block';

  // Populate device types for prices
  populateTradeInDeviceTypes("deviceTypePrices");
  resetScrollPosition;
}
function goToPhase2TradeIn() {
  console.log("goToPhase2TradeIn");

  // Hide phase 1
  const phase1Div = document.getElementById('phase1');
  phase1Div.style.display = 'none';

  // Show phase 2
  const phase2Div = document.getElementById('phase2TradeIn');
  phase2Div.style.display = 'block';

  // Populate device types for trade-in
  populateTradeInDeviceTypes("deviceTypeTradeIn");

  // Hide continue button until a category is selected
  document.getElementById("checkForSwapButton").style.display = "none";

  window.scrollTo(0, 0);
  
  updateProgressBar(2);
  resetScrollPosition;
}
function goToPhase2Swap() {
  console.log("goToPhase2Swap");

   // Scroll the content container to the top
   document.querySelector('.content-container').scrollTop = 0;

  // Hide phase 1
  const phase1Div = document.getElementById('phase1');
  phase1Div.style.display = 'none';

  // Show phase 2
  const phase2Div = document.getElementById('phase2Swap');
  phase2Div.style.display = 'block';

  // Populate device types for trade-in
  populateTradeInDeviceTypes("deviceTypeSwap");

  // Hide continue button until a category is selected
  document.getElementById("continueButton").style.display = "none";
  
  window.scrollTo(0, 0);
  
  updateProgressBar(2);
  resetScrollPosition;
}
function continueToPhase3() {
  console.log(`Device Category: ${tradeInConfiguration.deviceCategory}`);

   // Scroll the content container to the top
   document.querySelector('.content-container').scrollTop = 0;

  if (tradeInConfiguration.deviceCategory) {
    // Hide phase 2
    const phase2TradeIn = document.getElementById("phase2TradeIn");
    const phase2Swap = document.getElementById("phase2Swap");
    phase2TradeIn.style.display = "none";
    phase2Swap.style.display = "none";

    // Show loading bar
    const loadingBar = document.createElement("div");
    loadingBar.classList.add("loading-bar");
    const contentContainer = document.querySelector(".content-container");
    contentContainer.appendChild(loadingBar);

    // Animate the loading bar width
    const loadingBarAnimation = loadingBar.animate(
      [{ width: "100%" }, { width: "100%" }],
      { duration: 1150, iterations: Infinity }
    );

    // Show phase 3 after the loading animation is complete
    setTimeout(function () {
      // Stop the loading bar animation
      loadingBarAnimation.cancel();

      // Remove the loading bar
      contentContainer.removeChild(loadingBar);

      // Show phase 3
      const phase3 = document.getElementById("phase3");
      phase3.style.display = "block";
    }, 3000);
  }

  populateDeviceNames(tradeInConfiguration.deviceCategory);

  window.scrollTo(0, 0);
  updateProgressBar(3);
  resetScrollPosition;
}
function showLoading() {
  const contentContainer = document.querySelector(".content-container");

  // Create the loading bar element
  const loadingBar = document.createElement("div");
  loadingBar.classList.add("loading-bar");

  // Create the loading text container
  const loadingTextContainer = document.createElement("div");
  loadingTextContainer.classList.add("loading-text-container");

  // Create the loading text element
  const loadingText = document.createElement("div");
  loadingText.classList.add("loading-text");

  // Create an array of loading texts
  const loadingTexts = ["Searching for Devices 👀", "Populating Device Lists 📝"];

  // Function to rotate through loading texts
  let index = 0;
  function rotateLoadingText() {
    loadingText.textContent = loadingTexts[index];
    index = (index + 1) % loadingTexts.length;
  }

  // Initial loading text
  rotateLoadingText();

  // Set interval to rotate through loading texts
  const loadingTextInterval = setInterval(rotateLoadingText, 2000);

  // Append the loading text to the loading text container
  loadingTextContainer.appendChild(loadingText);

  // Append the loading text container to the loading bar
  loadingBar.appendChild(loadingTextContainer);

  // Append the loading bar to the content container
  contentContainer.appendChild(loadingBar);

  // Show the loading bar
  loadingBar.style.display = "block";

  // Function to hide the loading bar and clear the loading text interval
  function hideLoading() {
    clearInterval(loadingTextInterval);
    loadingBar.style.display = "none";
  }
}
function goToPhase6() {
   // Scroll the content container to the top
  document.querySelector('.content-container').scrollTop = 0;
  
  // Hide phase 3
  document.getElementById("phase3").style.display = "none";

  // Show phase 6
  document.getElementById("phase6").style.display = "block";
  
  window.scrollTo(0, 0);
  
  updateProgressBar(4);
  resetScrollPosition('.content-container');
}
function goToPhase4() {
  console.log("goToPhase4");

     // Scroll the content container to the top
     document.querySelector('.content-container').scrollTop = 0;

  // Hide phase 6
  document.getElementById("phase6").style.display = "none";

  // Show phase 4
  document.getElementById("phase4").style.display = "block";

  // Populate device types for swap
  populateSwapDeviceTypes("swapDeviceTypeContainer");
  
  window.scrollTo(0, 0);
  
  updateProgressBar(5);
  resetScrollPosition('.content-container');
}
function continueToPhase5() {

     // Scroll the content container to the top
     document.querySelector('.content-container').scrollTop = 0;

  // Hide phase 4
  const phase4 = document.getElementById("phase4");
  phase4.style.display = "none";

  // Show loading bar
  const loadingBar = document.createElement("div");
  loadingBar.classList.add("loading-bar");
  const contentContainer = document.querySelector(".content-container");
  contentContainer.appendChild(loadingBar);

  // Animate the loading bar width
  const loadingBarAnimation = loadingBar.animate(
    [{ width: "100%" }, { width: "100%" }],
    { duration: 1100, iterations: Infinity }
  );

  // Wait for the loading animation to complete
  setTimeout(function () {
    // Stop the loading bar animation
    loadingBarAnimation.cancel();

    // Remove the loading bar
    contentContainer.removeChild(loadingBar);

    // Show phase 5
    const phase5 = document.getElementById("phase5");
    phase5.style.display = "block";

    // Populate swap device names
    populateSwapDeviceNames();

    window.scrollTo(0, 0);

    updateProgressBar(6);
    resetScrollPosition('.content-container');
  }, 700);
}
function goToPhase7() {

     // Scroll the content container to the top
     document.querySelector('.content-container').scrollTop = 0;

  // Hide phase 5
  document.getElementById("phase5").style.display = "none";

  // Show phase 7
  document.getElementById("phase7").style.display = "block";
  updateProgressBar(7);
  
  window.scrollTo(0, 0);
  resetScrollPosition('.content-container');
}
function resetPhase1Selections() {
  // Get all the buttons in phase 1
  const buttons = [
    document.getElementById("CheckPriceButton"),
    document.getElementById("tradeInButton"),
    document.getElementById("swapButton")
  ];

  // Remove the 'selected' class from each button
  buttons.forEach((button) => {
    button.classList.remove('selected-button');
  });
}
function clearButtonSelections(containerId) {
  const container = document.getElementById(containerId);
  const buttons = container.querySelectorAll('button');
  
  buttons.forEach(button => {
    button.classList.remove('selected');
  });
}
function goBackFromPhase2Prices() {
  resetTradeInData();
  document.getElementById("deviceCategoryTradeIn").innerHTML = "";
  document.getElementById("deviceCategoryTradeIn").classList.add("hidden");

  // Reset selections in Phase 1
  resetPhase1Selections();
  clearButtonSelections('deviceTypePrices');
  clearButtonSelections('deviceCategoryPrices');

  // Hide phase 2
  document.getElementById("pricesPhase").style.display = "none";

  // Show phase 1
  document.getElementById("phase1").style.display = "block";
}
function goBackFromPhase2TradeIn() {
  resetTradeInData();
  document.getElementById("deviceCategoryTradeIn").innerHTML = "";
  document.getElementById("deviceCategoryTradeIn").classList.add("hidden");

  // Reset selections in Phase 1
  resetPhase1Selections();
  clearButtonSelections('deviceTypeTradeIn');
  clearButtonSelections('deviceCategoryTradeIn');

  // Hide phase 2
  document.getElementById("phase2TradeIn").style.display = "none";

  // Show phase 1
  document.getElementById("phase1").style.display = "block";
}
function goBackFromPhase2Swap() {
  resetSwapData();
  document.getElementById("deviceCategorySwap").innerHTML = "";
  document.getElementById("deviceCategorySwap").classList.add("hidden");

  // Reset selections in Phase 1
  resetPhase1Selections();
  clearButtonSelections('deviceTypeSwap');
  clearButtonSelections('deviceCategorySwap');

  // Hide phase 2
  document.getElementById("phase2Swap").style.display = "none";

  // Show phase 1
  document.getElementById("phase1").style.display = "block";
}
function goBackFromPhase3() {
  resetPhase3Data();
  hideLoadingAnimation();

  removeSelectedButtonClass('deviceNameContainer');
  removeSelectedButtonClass('deviceConfigurationContainer');

  // Reset the trade-in output and swap rate output text
  document.getElementById("tradeInOutput").style.display = 'none';

  // Hide phase 3
  document.getElementById("phase3").style.display = "none";

  // Show phase 2
  document.getElementById("phase2Swap").style.display = "block";
}
function goBackFromPhase6() {
  resetPhase6Data();
  removeSelectedButtonClass('step0');

  // Hide phase 6
  document.getElementById("phase6").style.display = "none";

  // Show phase 3
  document.getElementById("phase3").style.display = "block";
}
function goBackFromPhase4() {
  resetPhase4And5Data();
  removeSelectedButtonClass('swapDeviceTypeContainer');
  removeSelectedButtonClass('swapDeviceCategory');

  // Hide phase 4
  document.getElementById("phase4").style.display = "none";

  // Show phase 6
  document.getElementById("phase6").style.display = "block";

  document.getElementById("swapDeviceCategory").classList.add("hidden");
}
function goBackFromPhase5() {
  resetPhase4And5Data();
  hideLoadingAnimation();

  removeSelectedButtonClass('swapDeviceNameContainer');
  removeSelectedButtonClass('swapDeviceConfigurationContainer');

  // Reset the trade-in output and swap rate output text
  document.getElementById("swapRateOutput").style.display = 'hidden';
  
  // Hide phase 5
  document.getElementById("phase5").style.display = "none";

  // Show phase 4
  document.getElementById("phase4").style.display = "block";

  document.getElementById("swapDeviceConfigurationContainer").classList.add("hidden");
}
function goToNoSwap() {
  document.getElementById('phase6').style.display = 'none';
  document.getElementById('noSwap').style.display = 'block';
}
function resetTradeInData() {
  tradeInConfiguration.deviceType = null;
  tradeInConfiguration.deviceCategory = null;
  removeSelectedButtonClass('phase1ButtonsContainer');
}
function resetSwapData() {
  tradeInConfiguration.deviceType = null;
  tradeInConfiguration.deviceCategory = null;
  removeSelectedButtonClass('phase2ButtonsContainer');
}
function resetPhase6Data() {
  isPerfectCondition = true;
  tradeInConfiguration.bodyConditionDeduction = 0;
  tradeInConfiguration.screenConditionDeduction = 0;
  tradeInConfiguration.batteryHealthDeduction = 0;
  tradeInConfiguration.networkBiometricsDeduction = 0;
  removeSelectedButtonClass('phase5ButtonsContainer');
}
function resetPhase3Data() {
  tradeInConfiguration.deviceName = "";
  tradeInConfiguration.deviceType = "";
  tradeInConfiguration.configuration = "";
  tradeInConfiguration.tradeInValue = 0;
}
function resetPhase4And5Data() {
  swapConfiguration.deviceName = "";
  swapConfiguration.deviceType = "";
  swapConfiguration.deviceCategory = "";
  swapConfiguration.configuration = "";
  swapConfiguration.deviceQuality = "";
  swapConfiguration.currentRetailPrice = 0;
  swapConfiguration.swapRate = 0;
  removeSelectedButtonClass('phase4ButtonsContainer');
}
function removeSelectedButtonClass(containerId) {
  const buttonElements = document.querySelectorAll(`#${containerId} button`);
  buttonElements.forEach((button) => {
    button.classList.remove('selected-button');
  });
}
function resetScrollPosition() {
  setTimeout(() => {
    let contentContainer = document.getElementById('content-container');
    contentContainer.scrollTop = 0;
  }, 100);
}  
function startOver() {
  console.log("startOver called");

  // Reset buttons for device types and categories
  const deviceTypeContainers = ["deviceTypeTradeIn", "deviceTypeSwap"];
  const deviceCategoryContainers = ["deviceCategoryTradeIn", "deviceCategorySwap"];

  deviceTypeContainers.forEach(containerId => {
    const container = document.getElementById(containerId);
    container.querySelectorAll("button").forEach(button => {
      button.classList.remove("selected-button");
      button.classList.remove("hidden");
    });
  });

  deviceCategoryContainers.forEach(containerId => {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; // Clear the container
    container.classList.add("hidden"); // Hide the container
  });

  // Hide all other phases
  for (let i = 2; i <= 7; i++) {
    const phaseDiv = document.getElementById(`phase${i}`);
    if (phaseDiv) {
      phaseDiv.style.display = 'none';
    }
  }

  // Show phase 1
  const phase1Div = document.getElementById('phase1');
  phase1Div.style.display = 'block';

  // Reset the innerHTML and style of the swapBreakdown div
  const swapBreakdownDiv = document.getElementById("swapBreakdown");
  if (swapBreakdownDiv) {
    swapBreakdownDiv.innerHTML = "";
    swapBreakdownDiv.style.display = "none";
  }

  // Reset the "View Swap Breakdown" button
  const viewSwapBreakdownButton = document.getElementById("viewSwapBreakdownButton");
  if (viewSwapBreakdownButton) {
    viewSwapBreakdownButton.style.display = "block";
  }

  // Reset the global variables
  selectedLocation = "";
  isPerfectCondition = true;
  tradeInConfiguration = {
    deviceName: "",
    deviceType: "",
    deviceCategory: "",
    configuration: "",
    tradeInValue: 0,
    bodyConditionDeduction: 0,
    screenConditionDeduction: 0,
    batteryHealthDeduction: 0,
    networkBiometricsDeduction: 0
  };

  swapConfiguration = {
    deviceName: "",
    deviceType: "",
    deviceCategory: "",
    configuration: "",
    deviceQuality: "",
    swapRate: 0
  };

  // Reset the checkForSwapButton and continueButton
  document.getElementById("checkForSwapButton").style.display = "none";
  document.getElementById("continueButton").style.display = "none";

  // Reset Swap Device Category buttons
  const swapCategoryButtons = document.querySelectorAll("[data-device-category]");
  swapCategoryButtons.forEach(button => {
    button.classList.remove("hidden");
    button.classList.remove("selected-button");
  });

  // Reset Swap Device Type buttons
  const swapTypeButtons = document.querySelectorAll("[data-device-type]");
  swapTypeButtons.forEach(button => {
    button.classList.remove("hidden");
    button.classList.remove("selected-button");
  });

  // Reset the trade-in output and swap rate output text
  document.getElementById("tradeInOutput").classList.add("hidden");
  document.getElementById("swapRateOutput").classList.add("hidden");

  removeSelectedButtonClass('SwapButton');
  resetPhase1Selections();
  console.log("startOver finished");
}
function updateTradeInValue() {
  const tradeInValueElement = document.getElementById('tradeInConfiguration.tradeInValue');
  tradeInValueElement.textContent = selectedConfiguration.tradeInConfiguration.tradeInValue;
}
function updateStepVisibility(hideStepId, showStepId) {
  document.getElementById(hideStepId).style.display = "none";
  document.getElementById(showStepId).style.display = "block";
}
function clearDependentButtons(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  container.classList.add("hidden");
}
function handleButtonClick(event) {
  if (event.target.classList.contains("selected-button")) {
    console.log("Deselecting button and showing all buttons");
    const siblingButtons = event.target.parentElement.querySelectorAll("button");
    siblingButtons.forEach(button => {
      button.classList.remove("hidden");
    });
    event.target.classList.remove("selected-button");
    event.stopPropagation(); // Stop the event propagation

    // Clear dependent buttons
    if (event.target.parentElement.id === "deviceTypeTradeIn") {
      clearDependentButtons("deviceCategoryTradeIn");
    } else if (event.target.parentElement.id === "deviceTypeSwap") {
      clearDependentButtons("deviceCategorySwap");
    } else if (event.target.parentElement.id === "deviceTypePrices") {
      clearDependentButtons("deviceCategoryPrices");
    }
  } else {
    if (event.target.dataset.deviceType) {
      handleDeviceTypeClick(event);
    } else {
      handleCategoryClick(event);
    }
  }
}
function showLoadingAnimation(subHeaderText, loadingText) {
  const loadingContainer = document.getElementById("loadingContainer");
  const loadingTextContainer = document.getElementById("loadingTextContainer");
  const loadingSubHeader = document.getElementById("loadingSubHeader");

  // Update the subheader text
  loadingSubHeader.textContent = subHeaderText;

  // Add the 'loading-text' class to the loadingTextContainer
  loadingTextContainer.classList.add("loading-text");

  loadingContainer.style.display = "block";
  let index = 0;
  loadingTextContainer.textContent = loadingText[index];
  const textInterval = setInterval(() => {
    index++;
    if (index < loadingText.length) {
      loadingTextContainer.textContent = loadingText[index];
    } else {
      clearInterval(textInterval);
    }
  }, 1000);
}
function showLoadingAnimationSwap(subHeaderText, loadingText) {
  const loadingContainer = document.getElementById("loadingContainerSwap");
  const loadingTextContainer = document.getElementById("loadingTextContainerSwap");
  const loadingSubHeader = document.getElementById("loadingSubHeaderSwap");

  // Update the subheader text
  loadingSubHeader.textContent = subHeaderText;

  // Add the 'loading-text' class to the loadingTextContainer
  loadingTextContainer.classList.add("loading-text");

  loadingContainer.style.display = "block";
  let index = 0;
  loadingTextContainer.textContent = loadingText[index];
  const textInterval = setInterval(() => {
    index++;
    if (index < loadingText.length) {
      loadingTextContainer.textContent = loadingText[index];
    } else {
      clearInterval(textInterval);
    }
  }, 1000);
}
function hideLoadingAnimation() {
  document.getElementById("loadingContainer").style.display = "none";
  document.getElementById("loadingContainerSwap").style.display = "none";
}
function togglePricesPhaseStyles() {
  const popup = document.getElementById("popup");
  const overlay = document.getElementById("overlay");

  popup.classList.toggle("prices-phase-popup");
  overlay.classList.toggle("prices-phase-overlay");
}


document.addEventListener('DOMContentLoaded', loadData);

// Add event listeners for location buttons
document.getElementById("locationPortHarcourt").addEventListener("click", () => onLocationButtonClick("Port Harcourt"));
document.getElementById("locationYenagoa").addEventListener("click", () => onLocationButtonClick("Yenagoa"));
document.getElementById("locationAbuja").addEventListener("click", () => onLocationButtonClick("Abuja"));
document.getElementById("locationUyo").addEventListener("click", () => onLocationButtonClick("Uyo"));
document.getElementById("locationLagos").addEventListener("click", () => onLocationButtonClick("Lagos"));
document.getElementById("locationOtherCities").addEventListener("click", () => onLocationButtonClick("Other Cities"));
    
// Add event listener to the "Check for Prices" button
document.getElementById("CheckPriceButton").addEventListener("click", goToPricesPhase);

document.addEventListener("DOMContentLoaded", function () {
  const backgroundVideo = document.getElementById("backgroundVideo");

  backgroundVideo.addEventListener("ended", function () {
    backgroundVideo.style.opacity = 0;
  });
});

// Add event listeners to the button containers
document.querySelectorAll('.button-container').forEach(container => {
  container.addEventListener('click', handleButtonClick);
});

// Event listeners for Phase 1 buttons
document.getElementById("tradeInButton").addEventListener("click", function() {
  this.classList.add("clicked");
  goToPhase2TradeIn();
});
document.getElementById("swapButton").addEventListener("click", function() {
  this.classList.add("clicked");
  goToPhase2Swap();
});
document.getElementById("CheckPriceButton").addEventListener("click", function() {
  this.classList.add("clicked");
  goToPricesPhase();
});

document.getElementById("swapButton").addEventListener("click", function () {
  document.getElementById("progressBar").style.display = "block";
});

document.getElementById("tradeInButton").addEventListener("click", function () {
  document.getElementById("progressBar").style.display = "block";
});
