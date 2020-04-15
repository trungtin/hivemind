export const schema = {
    "models": {
        "Page": {
            "name": "Page",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "title": {
                    "name": "title",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "blocks": {
                    "name": "blocks",
                    "isArray": true,
                    "type": {
                        "model": "Block"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": "page"
                    }
                }
            },
            "syncable": true,
            "pluralName": "Pages",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                }
            ]
        },
        "Block": {
            "name": "Block",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "content": {
                    "name": "content",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "page": {
                    "name": "page",
                    "isArray": false,
                    "type": {
                        "model": "Page"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetName": "blockPageId"
                    }
                },
                "parent": {
                    "name": "parent",
                    "isArray": false,
                    "type": {
                        "model": "Block"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetName": "blockParentId"
                    }
                },
                "children": {
                    "name": "children",
                    "isArray": true,
                    "type": {
                        "model": "Block"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": "parent"
                    }
                }
            },
            "syncable": true,
            "pluralName": "Blocks",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                }
            ]
        }
    },
    "enums": {},
    "nonModels": {},
    "version": "4078e9ccaf89552bcb2ab43f86bca99b"
};