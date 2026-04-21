import requests, time
urls = [
    'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0',
    'https://services1.arcgis.com/KHyU64FWGq6mvNri/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0',
    'https://services1.arcgis.com/JoAFXwlKHLyOd6vo/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0'
]
bbox = '-82.465,27.945,-82.455,27.955'
headers = {'User-Agent': 'Mozilla/5.0'}
params = {
    'where': '1=1', 'outFields': '*', 'f': 'geojson', 'geometry': bbox,
    'geometryType': 'esriGeometryEnvelope', 'resultRecordCount': 10
}
for url in urls:
    print(f'Testing URL: {url}')
    for attempt in range(2):
        if attempt > 0: time.sleep(2)
        try:
            r = requests.get(url + '/query', params=params, headers=headers, timeout=20)
            if r.status_code == 200:
                data = r.json()
                feats = data.get('features', [])
                keys = list(feats[0].get('properties', {}).keys()) if feats else []
                print(f'  Attempt {attempt+1}: Status 200, Features: {len(feats)}, Keys: {keys}')
                break
            else:
                print(f'  Attempt {attempt+1}: Status {r.status_code}')
        except Exception as e:
            print(f'  Attempt {attempt+1}: {type(e).__name__}')
    print('-' * 40)
