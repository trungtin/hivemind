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
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "json": {
                    "name": "json",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": true,
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
    "version": "4792bceb7ad0042d58a069040daff7c4"
};