import requests
url = "https://services2.arcgis.com/FiaPAFR0unSNJ7ot/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query"
params = {
    "where": "1=1",
    "outFields": "*",
    "resultRecordCount": 1,
    "f": "json"
}
try:
    # Use session to handle potential issues with individual requests
    session = requests.Session()
    session.verify = False
    response = session.get(url, params=params)
    print(f"Request URL: {response.url}")
    data = response.json()
    if "features" in data and len(data["features"]) > 0:
        attributes = data["features"][0]["attributes"]
        keys = list(attributes.keys())
        print("All Keys:", ", ".join(keys))
        print("\nState-related Keys and Values:")
        for key in keys:
            if "STATE" in key.upper():
                print(f"{key}: {attributes[key]}")
    else:
        print("No features found.")
        print(data)
except Exception as e:
    print(f"Error: {e}")
