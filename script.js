// Global variables
const API_KEY = 'AIzaSyCqNBQlnUIqfBK4Oz_SpsNETC8lYuPUpSQ';
const SPREADSHEET_ID = '1nM67nJrGNMuoHzbYKsSolhTl3W94UUCW0oVW14AuTWk';
const RANGE = 'Trade In & Retail Price Mngt.!m6:z141';
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
  swapRate: 0
};

// Load data from Google Sheet
async function loadData() {
  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`);
    const json = await response.json();
    data = json.values.slice(1).filter(row => row[0]); // Filter out rows with empty categories

    console.log("Loaded data:", data); // Log the loaded data

    populateTradeInDeviceTypes("deviceTypeTradeIn");
    populateSwapDeviceTypes("deviceTypeSwap");
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

function showPricesPhase() {
  console.log("showPricesPhase");

  // Slide transitions
  document.getElementById("phase1").classList.add("slide-out-left");
  document.getElementById("pricesPhase").classList.add("slide-in-right");

  setTimeout(() => {
    // Hide phase 1
    const phase1Div = document.getElementById('phase1');
    phase1Div.style.display = 'none';

    // Show the prices phase
    const pricesPhaseDiv = document.getElementById('pricesPhase');
    pricesPhaseDiv.style.display = 'block';

    // Show the overlay and popup
    document.getElementById("overlay1").classList.remove("hidden");
    document.getElementById("overlay2").classList.remove("hidden");
    document.getElementById("popup").classList.remove("hidden");

    // Populate device types for trade-in
    populateTradeInDeviceTypes("deviceTypeTradeIn");
  }, 500);

  // Show the prices transition video
  var pricesTransitionVideo = document.getElementById("pricesTransitionVideo");
  var pricesTransitionVideoMobile = document.getElementById("pricesTransitionVideoMobile");
  if (window.innerWidth >= 768) {
    pricesTransitionVideo.style.display = "block";
    pricesTransitionVideo.play();
  } else {
    pricesTransitionVideoMobile.style.display = "block";
    pricesTransitionVideoMobile.play();
  }

  // Set the background image to the prices phase after the video ends
  pricesTransitionVideo.onended = function() {
    document.body.classList.add("prices-phase-background");
    // Hide the prices transition video
    pricesTransitionVideo.style.display = "none";
    // Update overlay background images
    setBackgroundForOverlay(document.getElementById("overlay1"));
    setBackgroundForOverlay(document.getElementById("overlay2"));
    // Update the scrollbar to the top
    window.scrollTo(0, 0);
  };

  pricesTransitionVideoMobile.onended = function() {
    document.body.classList.add("prices-phase-background");
    // Hide the prices transition video
    pricesTransitionVideoMobile.style.display = "none";
    // Update overlay background images
    setBackgroundForOverlay(document.getElementById("overlay1"));
    setBackgroundForOverlay(document.getElementById("overlay2"));
    // Update the scrollbar to the top
    window.scrollTo(0, 0);
  };
}

function setBackgroundForOverlay(overlay) {
  let backgroundImage = overlay.getAttribute("data-background-image");
  overlay.style.backgroundImage = `url(${backgroundImage})`;
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
      button.addEventListener("click", handleDeviceTypeClickTradeIn);
      container.appendChild(button);
    }
  });
}

function handleDeviceTypeClickTradeIn(event) {
  const deviceType = event.target.dataset.deviceType;
  console.log(`Trade-in Device Type Selected: ${deviceType}`);

  const containerId = "deviceCategoryTradeIn";
  tradeInConfiguration.deviceType = deviceType;

  // Get the unique categories based on the selected device type
  const categories = Array.from(new Set(data.filter(row => row[0] === deviceType).map(row => row[1])));

  // Clear existing categories
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  // Create and append category buttons
  categories.forEach(category => {
    const button = document.createElement('button');
    button.dataset.deviceCategory = category;
    button.textContent = category;
    button.addEventListener("click", handleCategoryClickTradeIn);
    container.appendChild(button);
  });

  container.classList.remove("hidden");

  // Hide other device type buttons
  const deviceTypeButtons = event.target.parentElement.querySelectorAll("button");
  deviceTypeButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class
  document.getElementById("checkForSwapButton").style.display = "block";
}

function handleDeviceTypeClickSwap(event) {
  const deviceType = event.target.dataset.deviceType;
  console.log(`Swap Device Type Selected: ${deviceType}`);

  const containerId = "deviceCategorySwap";
  swapConfiguration.deviceType = deviceType;

  // Get the unique categories based on the selected device type
  const categories = Array.from(new Set(data.filter(row => row[0] === deviceType).map(row => row[1])));

  // Clear existing categories
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  // Create and append category buttons
  categories.forEach(category => {
    const button = document.createElement('button');
    button.dataset.deviceCategory = category;
    button.textContent = category;
    button.addEventListener("click", handleCategoryClick);
    container.appendChild(button);
  });

  container.classList.remove("hidden");

  // Hide other device type buttons
  const deviceTypeButtons = event.target.parentElement.querySelectorAll("button");
  deviceTypeButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  event.target.classList.remove("hidden"); // Keep the selected button visible
  event.target.classList.add("selected-button"); // Add the selected-button class
  document.getElementById("continueButton").style.display = "block";
}



function handleCategoryClickTradeIn(event) {
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

  // Show the "View Trade-In Value" button
  document.getElementById("viewTradeInValueButton").style.display = "inline-block";
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

  // Show the "Continue" button
  document.getElementById("continueButton").style.display = "inline-block";
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
  
    // Append the checkForSwapButton to the tradeInTableContainer
    const checkForSwapButton = document.getElementById("checkForSwapButton");
    tradeInTableContainer.appendChild(checkForSwapButton);
    checkForSwapButton.style.display = "none"; // Hide the button initially
  } else {
    console.log("Device type or category not selected");
  }
}

function populateDeviceNames(deviceCategory) {
  console.log(`Populating device names for category: ${deviceCategory}`);
  // Populate device names based on the selected category
  const deviceNameContainer = document.getElementById("deviceNameContainer");
  deviceNameContainer.innerHTML = "";

  const deviceNames = data
    .filter((device) => device[1] === deviceCategory)
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
    console.log(`Appended button for device name: ${deviceName}`); // Add this console log
  });
}

function handleDeviceNameClick(event) {
  const deviceName = event.target.dataset.deviceName;
  console.log(`Device Name Selected: ${deviceName}`);

  tradeInConfiguration.deviceName = deviceName;

  // Get the unique configurations based on the selected device name
  const configurations = Array.from(
    new Set(data.filter(row => row[4] === deviceName).map(row => row[5]))
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

  displayTradeInOutput(tradeInConfiguration.deviceName, tradeInConfiguration.configuration); // Update this function to get the value based on the selected device name and configuration

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
    <p class="par5">You can Get Up to <strong>${value}</strong> when you Trade In📲 your <strong>${deviceConfiguration}, ${deviceName}</strong>. You can either Trade In  for <strong>Cash</strong> 💵 or <strong>Swap</strong> 🔄 to another Device.</p>
    <p class="par4">Remember that this <strong>Value</strong> only applies if your <strong>${deviceName}</strong> is in <strong>Perfect Condition</strong>✨. If there are any issues we need to know, Please inform our Sales Team👩‍💼👨‍💼.</p>
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
      button.addEventListener("click", handleDeviceTypeClickSwap);
      container.appendChild(button);
    }
  });
}

function handleSwapDeviceTypeClick(event) {
  console.log("handleSwapDeviceTypeClick");
  const targetType = event.target.getAttribute("data-device-type");
  if (!targetType) return;

  swapConfiguration.deviceType = targetType;

  // Get the unique categories based on the selected device type
  const categories = Array.from(new Set(data.filter(row => row[0] === targetType).map(row => row[1])));

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
  document.getElementById("continueToPhase5Button").style.display = "inline-block";
}

function populateSwapDeviceNames() {
  console.log(`Populating swap device names for category: ${swapConfiguration.deviceCategory}`);
  // Populate device names based on the selected category
  const swapDeviceNameContainer = document.getElementById("swapDeviceNameContainer");
  swapDeviceNameContainer.innerHTML = "";

  const deviceData = data.filter(
    (device) => device[0] === swapConfiguration.deviceType && device[1] === swapConfiguration.deviceCategory
  );

  // Remove duplicates
  const uniqueDeviceData = [...new Map(deviceData.map(item => [item[4], item])).values()];

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

    button.addEventListener("click", handleSwapDeviceNameClick);
    swapDeviceNameContainer.appendChild(button);
    console.log(`Appended button for device name: ${device[4]}`);
  });
}


function handleSwapDeviceNameClick(event) {
  if (event.target.tagName.toLowerCase() === "button") {
    const swapDeviceName = event.target.dataset.deviceName;
    console.log(`Device Name Selected: ${swapDeviceName}`);

    swapConfiguration.deviceName = swapDeviceName; // Set the global variable

    // Get the unique configurations based on the selected device name
    const configurations = Array.from(
      new Set(data.filter(row => row[4] === swapDeviceName).map(row => row[5]))
    );

    console.log(`Configurations: ${JSON.stringify(configurations)}`);

    // Clear existing configurations
    swapDeviceConfigurationContainer.innerHTML = "";

    // Create and append configuration buttons
    configurations.forEach(configuration => {
      
      // Find the corresponding retail price
      const price = data.find(row => row[4] === swapDeviceName && row[5] === configuration)[6];

      const button = document.createElement("button");
      button.dataset.swapDeviceConfiguration = configuration;

      const configElement = document.createElement("div");
      configElement.textContent = configuration;
      button.appendChild(configElement);
  
      const retailPrice = document.createElement("div"); // Change to retailPrice
      retailPrice.style.fontSize = "smaller";
      retailPrice.style.paddingTop = "5px";
      retailPrice.style.color = "grey";
      retailPrice.textContent = `${price}`; // Display the retail price
      button.appendChild(retailPrice);

      button.addEventListener("click", handleSwapConfigurationClick);
      swapDeviceConfigurationContainer.appendChild(button);
    });

    // Hide other device name buttons
    const swapDeviceNameButtons = event.target.parentElement.querySelectorAll("button");
    swapDeviceNameButtons.forEach(div => {
      div.classList.add("hidden");
      div.classList.remove("selected-swap");
    });

    event.target.classList.remove("hidden"); // Keep the selected div visible
    event.target.classList.add("selected-button"); // Add the selected-swap class

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

    // Hide other configuration buttons
    const swapConfigurationButtons = event.target.parentElement.querySelectorAll("button");
    swapConfigurationButtons.forEach(button => {
      button.classList.add("hidden");
      button.classList.remove("selected-button");
    });

    event.target.closest("button").classList.remove("hidden"); // Keep the selected button visible
    event.target.closest("button").classList.add("selected-button"); // Add the selected-swap class

    displaySwapRateOutput(); // Add this line to display the swap rate output

    // Show the "Continue" button
    document.getElementById("continueToPhase6Button").style.display = "block";
  }
}


function displaySwapRateOutput() {
  console.log("displaySwapRateOutput called");
  // Use global variables instead of passed parameters
  const oldDevice = tradeInConfiguration.deviceName;
  const oldConfig = tradeInConfiguration.configuration;
  const newDevice = swapConfiguration.deviceName;
  const newConfig = swapConfiguration.configuration;

  // Calculate swap rate based on your data or logic
  swapConfiguration.swapRate = calculateSwapRate(oldDevice, oldConfig, newDevice, newConfig);
  console.log("Calculated Swap Rate:", swapConfiguration.swapRate);

  // Round down the swap rate to the nearest 1000
  swapConfiguration.swapRate = Math.floor(swapConfiguration.swapRate / 1000) * 1000;
  
  const deviceQuality = data.find(
    (row) => row[4] === newDevice && row[5] === newConfig
  )[2];

  console.log("Device Quality:", deviceQuality);

  swapConfiguration.deviceQuality = deviceQuality;

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
    // Upgrade message
    swapRateOutputDiv.innerHTML = `
      <h4 class="htradein">…and we’re done!💃🏻💪🏾</h2>
      <p class="par5">We can confirm that for <strong>${formattedSwapRate}</strong> we can <strong>Upgrade</strong> your Nigerian Used <strong>${oldDevice} ${oldConfig}</strong> to a <strong>${swapConfiguration.deviceQuality}</strong> <strong>${newConfig} ${newDevice}</strong> 🥳</p>
      <p class="par4">Once again, we’d like to remind you that the Swap Rate only applies if your <strong>${oldDevice}</strong> is in Perfect Condition✨. If there are any issues we need to know, Please inform our Sales Team👩‍💼👨‍💼.</p>
    `;
  } else {
    // Downgrade message
    swapRateOutputDiv.innerHTML = `
      <h4 class="htradein">…and we’re done!💃🏻💪🏾</h2>
      <p class="par5">If you choose to <strong>Downgrade</strong> from your Nigerian Used <strong>${oldDevice} ${oldConfig}</strong> to a <strong>${swapConfiguration.deviceQuality}</strong> <strong>${newConfig} ${newDevice}</strong>, you’d be getting about <strong>${formattedSwapRate}</strong> as CashBack! 🤩</p>
      <p class="par4">Once again, we’d like to remind you that the Swap Rate only applies if your <strong>${oldDevice}</strong> is in Perfect Condition✨. If there are any issues we need to know, Please inform our Sales Team👩‍💼👨‍💼.</p>
    `;
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


// Declare global variables at the beginning of your script
let swapData = {};

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
    : "\n\nMy device also has some issues you'd need to Review.";

  const message = `
    I'd like to Swap my *${tradeInConfiguration.deviceName}, ${tradeInConfiguration.configuration}* for *${swapConfiguration.deviceName}, ${swapConfiguration.configuration}.* I've confirmed that my *Trade In Value* is ${formatCurrency(tradeInConfiguration.tradeInValue)} and the *Swap Rate* is ${formatCurrency(swapConfiguration.swapRate)}.
    I'm currently in ${selectedLocation}.${conditionMessage}
  `;
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/+2349163338000?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
}

// Updated viewSwapBreakdown function
function viewSwapBreakdown() {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0
    }).format(amount);
  };  

  const formatDeduction = (amount) => {
    return amount === 0 ? "None" : formatCurrency(amount);
  };

  const swapBreakdown = `
  <p class="par8">Here's the full breakdown of your Swap, including the Swap rate, Trade-in value, and any Deductions💰. 💻 You can Review the details in case you need clarification! 🧐<p>
  <ul>
    <li class="par8"><strong>Device:</strong> ${tradeInConfiguration.deviceName}, ${tradeInConfiguration.configuration}</li>
    <li class="par8"><strong>Swap Device:</strong> ${swapConfiguration.deviceName}, ${swapConfiguration.configuration}</li>
    <li class="par8"><strong>Swap Rate:</strong> ${formatCurrency(swapConfiguration.swapRate)}</li>
    <li class="par8"><strong>Trade-In Value:</strong> ${formatCurrency(tradeInConfiguration.tradeInValue)}</li>
    <li class="par8"><strong>Spots, Scratches & Dents:</strong> ${formatDeduction(tradeInConfiguration.bodyConditionDeduction)}</li>
    <li class="par8"><strong>Screen Issues:</strong> ${formatDeduction(tradeInConfiguration.screenConditionDeduction)}</li>
    <li class="par8"><strong>Battery Issues:</strong> ${formatDeduction(tradeInConfiguration.batteryHealthDeduction)}</li>
    <li class="par8"><strong>Network & Biometrics Issues:</strong> ${formatDeduction(tradeInConfiguration.networkBiometricsDeduction)}</li>
      </ul>
    </li>
  </ul>
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
  
    // Show the download buttons
    const downloadPdfButton = document.getElementById("downloadPdf");
    const downloadJpegButton = document.getElementById("downloadJpeg");
    if (downloadPdfButton && downloadJpegButton) {
      downloadPdfButton.style.display = "block";
      downloadJpegButton.style.display = "block";
    }
  }
  



function onConditionSelected(condition, event) {
  isPerfectCondition = condition === "Yes"; // Store the condition in the global variable
  console.log('Selected condition:', isPerfectCondition ? 'Yes' : 'No');

  // Hide other condition buttons
  const conditionButtons = event.target.parentElement.querySelectorAll("button");
  conditionButtons.forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("selected-button");
  });

  // Add the selected-button class to the selected button
  event.target.classList.remove("hidden");
  event.target.classList.add("selected-button");

  // Show the goToPhase7 button
  const phase6Element = document.getElementById("phase6");
  const goToPhase7Button = phase6Element.querySelector(".transition-button");
  if (goToPhase7Button) {
    goToPhase7Button.style.display = "inline-block";
  } else {
    console.error("goToPhase7 button not found");
  }
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
      <button class="selection-button" id="startOverButton" onclick="startOver()">Start Over</button>
  `;

  locationInstructions.appendChild(buttonsContainer);

  // Append the new div to the phase7 div
  document.getElementById("phase7").appendChild(locationInstructions);
}


function downloadSwapBreakdownPdf(fileType) {
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

  const swapBreakdownHtml = `
    <div style="font-family: Arial, sans-serif; background-image: url('images/your-background-image.jpg'); background-size: cover; padding: 20px;">
      <h2>Swap Breakdown</h2>
      <p>Device: ${tradeInConfiguration.deviceName} (${tradeInConfiguration.configuration})</p>
      <p>Swap Device: ${swapConfiguration.deviceName} (${swapConfiguration.configuration})</p>
      <p>Swap Rate: ${formatCurrency(swapConfiguration.swapRate)}</p>
      <p>Trade-In Value: ${formatCurrency(tradeInConfiguration.tradeInValue)}</p>
      <h3>Deductions:</h3>
      <ul>
        <li>Body Condition: ${formatDeduction(tradeInConfiguration.bodyConditionDeduction)}</li>
        <li>Screen Condition: ${formatDeduction(tradeInConfiguration.screenConditionDeduction)}</li>
        <li>Battery Health: ${formatDeduction(tradeInConfiguration.batteryHealthDeduction)}</li>
        <li>Network & Biometrics: ${formatDeduction(tradeInConfiguration.networkBiometricsDeduction)}</li>
      </ul>
    </div>
  `;

  const pdfOptions = {
    margin: 269,
    filename: "Swap_Breakdown." + fileType,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
  };

  const content = document.createElement("div");
  content.innerHTML = swapBreakdownHtml;

  if (fileType === "pdf") {
    html2pdf().set(pdfOptions).from(content).save();
  } else if (fileType === "jpeg") {
    html2canvas(content).then((canvas) => {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg");
      a.download = "Swap-Breakdown.jpeg";
      a.click();
    });
  }
}

// Navigation functions (goNext, goBack, etc.)

function goToPhase1() {
  // Remove the prices-phase-background class to restore the original background image
  document.body.classList.remove("prices-phase-background");

  // Clear any selections made in the prices phase
  resetTradeInData();
  document.getElementById("deviceCategoryPrices").innerHTML = "";
  document.getElementById("deviceCategoryPrices").classList.add("hidden");

  // Slide transitions
  document.getElementById("pricesPhase").classList.add("slide-out-right");
  document.getElementById("phase1").classList.add("slide-in-left");

  setTimeout(() => {
    // Hide the prices phase content
    document.getElementById("pricesPhase").style.display = "none";
    document.getElementById("pricesPhase").classList.remove("slide-out-right");

    // Show the phase1 content
    document.getElementById("phase1").style.display = "block";
    document.getElementById("phase1").classList.remove("slide-in-left");
  }, 500);
}

function goToPhase2TradeIn() {
  console.log("goToPhase2TradeIn");

  // Slide transitions
  document.getElementById("phase1").classList.add("slide-out-left");
  document.getElementById("phase2TradeIn").classList.add("slide-in-right");

  setTimeout(() => {
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
  }, 500);
}

function goToPhase2Swap() {
  console.log("goToPhase2Swap");

  // Slide transitions
  document.getElementById("phase1").classList.add("slide-out-left");
  document.getElementById("phase2Swap").classList.add("slide-in-right");

  setTimeout(() => {
    // Hide phase 1
    const phase1Div = document.getElementById('phase1');
    phase1Div.style.display = 'none';

    // Show phase 2
    const phase2Div = document.getElementById('phase2Swap');
    phase2Div.style.display = 'block';

    // Show the overlay and popup
    document.getElementById("overlay1").classList.remove("hidden");
    document.getElementById("popup").classList.remove("hidden");

    // Populate device types for trade-in
    populateTradeInDeviceTypes("deviceTypeTradeIn");

    // Hide continue button until a category is selected
    document.getElementById("continueButton").style.display = "none";
  }, 500);
}


function goBackFromPhase2TradeIn() {
  resetTradeInData();
  document.getElementById("deviceCategoryTradeIn").innerHTML = "";
  document.getElementById("deviceCategoryTradeIn").classList.add("hidden");

// Slide transitions
document.getElementById("phase2TradeIn").classList.add("slide-out-left");
document.getElementById("phase1").classList.add("slide-in-right");

setTimeout(() => {
  updateStepVisibility('phase2TradeIn', 'phase1');
  document.getElementById("phase2TradeIn").classList.remove("slide-out-left");
  document.getElementById("phase1").classList.remove("slide-in-right");
}, 500);
}

function goBackFromPhase2Swap() {
  resetSwapData();
  document.getElementById("deviceCategorySwap").innerHTML = "";
  document.getElementById("deviceCategorySwap").classList.add("hidden");

  // Slide transitions
  document.getElementById("phase2Swap").classList.add("slide-out-left");
  document.getElementById("phase1").classList.add("slide-in-right");

  setTimeout(() => {
    updateStepVisibility('phase2Swap', 'phase1');
    document.getElementById("phase2Swap").classList.remove("slide-out-left");
    document.getElementById("phase1").classList.remove("slide-in-right");
  }, 500);
}


function continueToPhase3() {
  console.log(`Device Category: ${tradeInConfiguration.deviceCategory}`);

  if (tradeInConfiguration.deviceCategory) {
    populateDeviceNames(tradeInConfiguration.deviceCategory);

    // Slide transitions
    document.getElementById("phase2Swap").classList.add("slide-out-left");
    document.getElementById("phase3").classList.add("slide-in-right");

    setTimeout(() => {
      updateStepVisibility("phase2Swap", "phase3");
      document.getElementById("phase2Swap").classList.remove("slide-out-left");
      document.getElementById("phase3").classList.remove("slide-in-right");
    }, 500);
  } else {
    alert("Please select a device category");
  }
}

function goBackFromPhase3() {
  // Slide transitions
  document.getElementById("phase3").classList.add("slide-out-left");
  document.getElementById("phase2Swap").classList.add("slide-in-right");

  setTimeout(() => {
    updateStepVisibility("phase3", "phase2Swap");
    document.getElementById("phase3").classList.remove("slide-out-left");
    document.getElementById("phase2Swap").classList.remove("slide-in-right");
  }, 500);
}

function goToPhase4() {
  console.log("goToPhase4");
  // Clear the previous device type selection
  document.getElementById("deviceTypeSwap").dataset.selectedDeviceType = "";

  // Slide transitions
  document.getElementById("phase3").classList.add("slide-out-left");
  document.getElementById("phase4").classList.add("slide-in-right");

  setTimeout(() => {
    // Hide phase 3
    const phase3Div = document.getElementById('phase3');
    phase3Div.style.display = 'none';

    // Show phase 4
    const phase4Div = document.getElementById('phase4');
    phase4Div.style.display = 'block';

    // Populate device types for swap
    populateSwapDeviceTypes("swapDeviceTypeContainer");
  }, 500);
}

function goBackFromPhase4() {
  // Slide transitions
  document.getElementById("phase4").classList.add("slide-out-left");
  document.getElementById("phase3").classList.add("slide-in-right");

  setTimeout(() => {
    updateStepVisibility("phase4", "phase3");
    document.getElementById("phase4").classList.remove("slide-out-left");
    document.getElementById("phase3").classList.remove("slide-in-right");
    document.getElementById("swapDeviceCategory").classList.add("hidden");
  }, 500);
}

// Phase 5 Slide In/Out
function continueToPhase5() {
  document.getElementById("phase4").classList.add("slide-out-left");
  setTimeout(() => {
    document.getElementById("phase4").style.display = "none";
    document.getElementById("phase4").classList.remove("slide-out-left");
  }, 300);

  document.getElementById("phase5").classList.add("slide-in-right");
  document.getElementById("phase5").style.display = "block";
  setTimeout(() => {
    document.getElementById("phase5").classList.remove("slide-in-right");
  }, 300);

  // Populate swap device names
  populateSwapDeviceNames();
}

function goBackFromPhase5() {
  document.getElementById("phase5").classList.add("slide-out-right");
  setTimeout(() => {
    document.getElementById("phase5").style.display = "none";
    document.getElementById("phase5").classList.remove("slide-out-right");
  }, 300);

  document.getElementById("phase4").classList.add("slide-in-left");
  document.getElementById("phase4").style.display = "block";
  setTimeout(() => {
    document.getElementById("phase4").classList.remove("slide-in-left");
  }, 300);

  document.getElementById("swapDeviceConfigurationContainer").classList.add("hidden");
}

// Phase 6 Slide In
function goToPhase6() {
  document.getElementById("phase5").classList.add("slide-out-left");
  setTimeout(() => {
    document.getElementById("phase5").style.display = "none";
    document.getElementById("phase5").classList.remove("slide-out-left");
  }, 300);

  document.getElementById("phase6").classList.add("slide-in-right");
  document.getElementById("phase6").style.display = "block";
  setTimeout(() => {
    document.getElementById("phase6").classList.remove("slide-in-right");
  }, 300);
}

function updateTradeInValue() {
  const tradeInValueElement = document.getElementById('tradeInConfiguration.tradeInValue');
  tradeInValueElement.textContent = selectedConfiguration.tradeInConfiguration.tradeInValue;
}

function goToPhase7() {
  // Hide the current phase
  const phase6Div = document.getElementById("phase6");
  phase6Div.style.display = "none";

  // Show the new phase
  const phase7Div = document.getElementById("phase7");
  phase7Div.style.display = "block";
}

function goToNoSwap() {
  document.getElementById('phase6').style.display = 'none';
  document.getElementById('noSwap').style.display = 'block';
}

function resetTradeInData() {
  tradeInConfiguration.deviceType = null;
  tradeInConfiguration.deviceCategory = null;
}

function resetSwapData() {
  // Reset any swap-specific data here
}

// Issue 1: startOver function with console logs
function startOver() {
  console.log("startOver called");

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
  console.log("startOver finished");
}

function updateStepVisibility(hideStepId, showStepId) {
  document.getElementById(hideStepId).style.display = "none";
  document.getElementById(showStepId).style.display = "block";
}


document.addEventListener('DOMContentLoaded', loadData);
document.getElementById("tradeInButton").addEventListener("click", goToPhase2TradeIn);
document.getElementById("swapButton").addEventListener("click", goToPhase2Swap);
document.getElementById("CheckPriceButton").addEventListener("click", showPricesPhase);

// Add event listeners for location buttons
document.getElementById("locationPortHarcourt").addEventListener("click", () => onLocationButtonClick("Port Harcourt"));
document.getElementById("locationYenagoa").addEventListener("click", () => onLocationButtonClick("Yenagoa"));
document.getElementById("locationAbuja").addEventListener("click", () => onLocationButtonClick("Abuja"));
document.getElementById("locationUyo").addEventListener("click", () => onLocationButtonClick("Uyo"));
document.getElementById("locationLagos").addEventListener("click", () => onLocationButtonClick("Lagos"));
document.getElementById("locationOtherCities").addEventListener("click", () => onLocationButtonClick("Other Cities"));

document.getElementById('overlay1').classList.add('shown');
document.addEventListener("DOMContentLoaded", function () {
  const backgroundVideo = document.getElementById("backgroundVideo");

  backgroundVideo.addEventListener("ended", function () {
    backgroundVideo.style.opacity = 0;
  });
});

document.getElementById("downloadPdf").addEventListener("click", () => {
  downloadSwapBreakdown("pdf");
});

document.getElementById("downloadJpeg").addEventListener("click", () => {
  downloadSwapBreakdown("jpeg");
});
